/**
 * AskService – retrieves relevant chunks and generates a citation-grade answer.
 *
 * Response contract:
 *   {
 *     answer:           string,
 *     citations:        Citation[],
 *     confidence:       'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT',
 *     needsHumanReview: boolean,
 *     traceId:          string,
 *   }
 *
 * LLM behaviour:
 *   - When GEMINI_API_KEY / API_KEY is set and RAG_STUB_GENERATION != 'true',
 *     uses Gemini for generation.
 *   - Otherwise falls back to deterministic stub generation (safe, no hallucination,
 *     but answers are simply the top retrieved snippet).
 *
 * Guardrails:
 *   - No indexed content → INSUFFICIENT answer immediately.
 *   - No relevant chunks found → INSUFFICIENT answer.
 *   - LLM returns INSUFFICIENT_EVIDENCE marker → propagates flag.
 */

import { randomUUID } from 'crypto';
import logger from '../../infra/logger.js';
import { db } from '../../infra/db.js';
import { retrieve, hasIndexedContent, clampTopK } from '../retrieval/retrievalService.js';
import {
  systemInstruction,
  buildContextPrompt,
  INSUFFICIENT_EVIDENCE_MARKER,
  selectChunksForPrompt,
} from './prompts.js';
import type {
  AskQuery,
  AskResponse,
  Citation,
  ConfidenceLevel,
  RetrievedChunk,
} from '../ingest/types.js';

const SOURCE_MARKER_REGEX = /\[SOURCE\s+(\d+)\]/gi;
const GENERATION_TIMEOUT_MS = Number(process.env.RAG_MODEL_TIMEOUT_MS ?? 15_000);
const GENERATION_RETRIES = Number(process.env.RAG_GENERATION_RETRIES ?? 1);
const MIN_GROUNDED_SCORE = Number(process.env.RAG_MIN_GROUNDED_SCORE ?? 0.2);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((c) => ({
    chunkId: c.chunkId,
    documentId: c.documentId,
    documentTitle: c.documentTitle,
    versionId: c.versionId,
    version: c.version,
    sectionLabel: c.sectionLabel,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
    snippet: c.content.slice(0, 300) + (c.content.length > 300 ? '…' : ''),
    score: c.score,
  }));
}

function deriveConfidence(chunks: RetrievedChunk[], answer: string): ConfidenceLevel {
  if (answer.startsWith(INSUFFICIENT_EVIDENCE_MARKER) || chunks.length === 0) {
    return 'INSUFFICIENT';
  }
  const topScore = chunks[0]?.score ?? 0;
  if (topScore >= 0.75) return 'HIGH';
  if (topScore >= 0.45) return 'MEDIUM';
  return 'LOW';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries: number): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i === retries) throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('LLM call failed');
}

function hasValidCitations(answer: string, availableSources: number): boolean {
  return extractSourceIndexes(answer, availableSources).length > 0;
}

function extractSourceIndexes(answer: string, availableSources: number): number[] {
  const matches = [...answer.matchAll(SOURCE_MARKER_REGEX)];
  if (matches.length === 0) return [];
  const indices = new Set<number>();
  for (const match of matches) {
    const idx = Number(match[1]);
    // Strict all-or-nothing guardrail for legal/privacy QA: any invalid marker invalidates grounding.
    if (!Number.isInteger(idx) || idx < 1 || idx > availableSources) return [];
    indices.add(idx);
  }
  return Array.from(indices.values()).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Stub generation (no LLM key required)
// ---------------------------------------------------------------------------

function stubGenerate(question: string, chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return `${INSUFFICIENT_EVIDENCE_MARKER} No relevant passages found in the indexed documents.`;
  }
  const top = chunks[0]!;
  const sectionNote = top.sectionLabel ? ` (${top.sectionLabel})` : '';
  return (
    `Based on the document "${top.documentTitle}"${sectionNote}: ` +
    top.content.slice(0, 500) +
    (top.content.length > 500 ? '…' : '') +
    ' [SOURCE 1]'
  );
}

// ---------------------------------------------------------------------------
// Gemini generation
// ---------------------------------------------------------------------------

async function geminiGenerate(question: string, chunks: RetrievedChunk[]): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.API_KEY ?? '';
  const genai = new GoogleGenAI({ apiKey });
  const modelName = process.env.RAG_GENERATION_MODEL ?? 'gemini-2.5-flash';

  const prompt = `${systemInstruction()}\n\n${buildContextPrompt(question, chunks)}`;

  const result = await withRetry(
    () =>
      withTimeout(
        genai.models.generateContent({
          model: modelName,
          contents: prompt,
        }),
        GENERATION_TIMEOUT_MS,
        'Gemini generation',
      ),
    GENERATION_RETRIES,
  );

  return result.text ?? '';
}

// ---------------------------------------------------------------------------
// AskService
// ---------------------------------------------------------------------------

/**
 * Main ask entrypoint.
 * Retrieves context, generates an answer, and returns a full citation-grade response.
 */
export async function ask(query: AskQuery): Promise<AskResponse> {
  const startMs = Date.now();
  const traceId = randomUUID();
  const { orgId, userId, question } = query;

  // -------------------------------------------------------------------------
  // Guard: no indexed content for this org
  // -------------------------------------------------------------------------
  const hasContent = await hasIndexedContent(orgId);
  if (!hasContent) {
    const response: AskResponse = {
      answer: `${INSUFFICIENT_EVIDENCE_MARKER} No documents have been indexed for this organisation. Please ingest documents first.`,
      citations: [],
      confidence: 'INSUFFICIENT',
      grounded: false,
      needsHumanReview: true,
      traceId,
    };
    await persistQueryLog({ traceId, orgId, userId, question, response, latencyMs: Date.now() - startMs });
    return response;
  }

  // -------------------------------------------------------------------------
  // Retrieve relevant chunks
  // -------------------------------------------------------------------------
  const { chunks, latencyMs: retrievalLatencyMs } = await retrieve({
    orgId,
    question,
    documentId: query.documentId,
    docType: query.docType,
    topK: clampTopK(query.topK),
  });
  const contextChunks = selectChunksForPrompt(chunks);

  // -------------------------------------------------------------------------
  // Generate answer
  // -------------------------------------------------------------------------
  let answer: string;
  let modelProvider: string | undefined;
  let modelName: string | undefined;

  const useStub =
    process.env.RAG_STUB_GENERATION === 'true' ||
    (!process.env.GEMINI_API_KEY && !process.env.API_KEY);

  if (useStub || contextChunks.length === 0) {
    answer = stubGenerate(question, contextChunks);
    modelProvider = 'stub';
    modelName = 'stub';
  } else {
    try {
      answer = await geminiGenerate(question, contextChunks);
      modelProvider = 'google';
      modelName = process.env.RAG_GENERATION_MODEL ?? 'gemini-2.5-flash';
    } catch (err) {
      logger.warn({ err }, '[RAG] Gemini generation failed, falling back to stub');
      answer = stubGenerate(question, contextChunks);
      modelProvider = 'stub-fallback';
      modelName = 'stub';
    }
  }

  // -------------------------------------------------------------------------
  // Build response
  // -------------------------------------------------------------------------
  const isInsufficient = answer.startsWith(INSUFFICIENT_EVIDENCE_MARKER) || contextChunks.length === 0;
  const sourceIndexes = extractSourceIndexes(answer, contextChunks.length);
  const citedChunks = sourceIndexes.map((idx) => contextChunks[idx - 1] as RetrievedChunk);
  const hasCitations = hasValidCitations(answer, contextChunks.length);
  const bestCitedScore = citedChunks.reduce((max, c) => Math.max(max, c.score), 0);
  const grounded = !isInsufficient && hasCitations && bestCitedScore >= MIN_GROUNDED_SCORE;

  if (!grounded) {
    answer = `${INSUFFICIENT_EVIDENCE_MARKER} The retrieved evidence is insufficient or uncited for a grounded answer.`;
  }

  const confidence = grounded ? deriveConfidence(contextChunks, answer) : 'INSUFFICIENT';
  const citations = grounded ? buildCitations(citedChunks) : [];
  const needsHumanReview = !grounded || confidence === 'LOW' || confidence === 'INSUFFICIENT';

  const response: AskResponse = {
    answer,
    citations,
    confidence,
    grounded,
    needsHumanReview,
    traceId,
  };

  const totalLatencyMs = Date.now() - startMs;

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------
  await persistQueryLog({
    traceId,
    orgId,
    userId,
    question,
    response,
    latencyMs: totalLatencyMs,
    retrievalLatencyMs,
    modelProvider,
    modelName,
    retrievedChunkIds: contextChunks.map((c) => `${c.documentId}:${c.chunkIndex}`),
  });

  logger.info(
    { traceId, orgId, confidence, grounded, chunks: contextChunks.length, latencyMs: totalLatencyMs },
    '[RAG] Ask complete',
  );

  return response;
}

// ---------------------------------------------------------------------------
// Audit persistence
// ---------------------------------------------------------------------------

interface LogPayload {
  traceId: string;
  orgId: string;
  userId?: string;
  question: string;
  response: AskResponse;
  latencyMs: number;
  retrievalLatencyMs?: number;
  modelProvider?: string;
  modelName?: string;
  retrievedChunkIds?: string[];
}

async function persistQueryLog(payload: LogPayload): Promise<void> {
  try {
    await db.aiQueryLog.create({
      data: {
        traceId: payload.traceId,
        orgId: payload.orgId,
        userId: payload.userId ?? null,
        question: payload.question,
        answer: payload.response.answer,
        confidence: payload.response.confidence,
        needsHumanReview: payload.response.needsHumanReview,
        retrievedCount: payload.response.citations.length,
        retrievedChunkIds: payload.retrievedChunkIds ?? [],
        modelProvider: payload.modelProvider ?? null,
        modelName: payload.modelName ?? null,
        latencyMs: payload.latencyMs,
      },
    });
  } catch (err) {
    // Audit log failures must not break the user-facing response
    logger.warn({ err }, '[RAG] Failed to persist AiQueryLog');
  }
}
