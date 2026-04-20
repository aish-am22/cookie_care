/**
 * RetrievalService – semantic retrieval with mandatory org/tenant filtering.
 *
 * Flow:
 *   1. Embed the query text.
 *   2. Query VectorStore with orgId filter + optional metadata filters.
 *   3. Return ranked chunks ready for citation-grade answer generation.
 */

import logger from '../../infra/logger.js';
import { getEmbeddingProvider } from '../ingest/embedder.js';
import { getVectorStore } from '../ingest/vectorStore.js';
import { getLexicalRetriever } from './lexicalRetriever.js';
import { getReranker } from './reranker.js';
import type {
  RetrievalQuery,
  RetrievalResult,
  RetrievedChunk,
  VectorStoreFilter,
} from '../ingest/types.js';

// Re-export types for convenience
export type { RetrievalQuery, RetrievalResult, RetrievedChunk };

// ---------------------------------------------------------------------------
// RetrievalService
// ---------------------------------------------------------------------------

const DEFAULT_TOP_K = 8;
export const MIN_TOP_K = 1;
export const MAX_TOP_K = 20;
const MIN_SCORE_THRESHOLD = 0.1; // Discard very low-relevance chunks
const DEFAULT_HYBRID_ALPHA = 0.7;
const LEXICAL_POOL_MULTIPLIER = 2;

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  return value.toLowerCase() === 'true';
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function parsePositiveInt(value: string | undefined, fallback: number, min = 1): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.floor(parsed));
}

function chunkKey(chunk: RetrievedChunk): string {
  return chunk.chunkId ?? `${chunk.documentId}:${chunk.versionId}:${chunk.chunkIndex}`;
}

export function clampTopK(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TOP_K;
  return Math.min(MAX_TOP_K, Math.max(MIN_TOP_K, Math.floor(value)));
}

/**
 * Retrieve the most relevant chunks for a query, enforcing org-level isolation.
 *
 * @param query - Must include orgId; other fields are optional metadata filters.
 * @returns Ranked chunks with scores, ready for citation building.
 */
export async function retrieve(query: RetrievalQuery): Promise<RetrievalResult> {
  const startMs = Date.now();
  const { orgId, question, documentId, docType } = query;
  const topK = clampTopK(query.topK);
  const hybridEnabled = parseBool(process.env.RAG_HYBRID_ENABLED, true);
  const hybridAlpha = clampUnit(Number(process.env.RAG_HYBRID_ALPHA), DEFAULT_HYBRID_ALPHA);
  const candidateMultiplier = parsePositiveInt(process.env.RAG_HYBRID_CANDIDATE_MULTIPLIER, 4, 2);
  const rerankEnabled = parseBool(process.env.RAG_RERANK_ENABLED, true);
  const rerankCandidates = Math.max(topK, parsePositiveInt(process.env.RAG_RERANK_CANDIDATES, topK * 2, 1));

  if (!orgId) throw new Error('RetrievalService: orgId is required for tenant isolation');

  // 1. Embed query
  const embedder = getEmbeddingProvider();
  const queryEmbedding = await embedder.embed(question);

  // 2. Build filter (orgId always mandatory)
  const filter: VectorStoreFilter = {
    orgId,
    ...(documentId ? { documentId } : {}),
    ...(docType ? { docType } : {}),
    threshold: MIN_SCORE_THRESHOLD,
  };

  // 3. Query vector store
  const vectorStore = getVectorStore();
  const lexicalRetriever = getLexicalRetriever();
  const denseLimit = Math.max(topK, Math.floor(topK * candidateMultiplier));
  const lexicalLimit = Math.max(topK, Math.floor(topK * candidateMultiplier * LEXICAL_POOL_MULTIPLIER));
  const [denseCandidates, lexicalCandidates] = await Promise.all([
    vectorStore.query(queryEmbedding, filter, denseLimit),
    lexicalRetriever.fetchCandidates(filter, lexicalLimit),
  ]);

  const merged = new Map<string, RetrievedChunk>();
  for (const chunk of denseCandidates) {
    merged.set(chunkKey(chunk), { ...chunk, denseScore: chunk.score });
  }
  for (const chunk of lexicalRetriever.score(question, lexicalCandidates)) {
    const key = chunkKey(chunk);
    const prev = merged.get(key);
    merged.set(key, {
      ...(prev ?? chunk),
      lexicalScore: chunk.lexicalScore ?? 0,
      denseScore: prev?.denseScore ?? prev?.score ?? 0,
    });
  }

  const hybridRanked = Array.from(merged.values())
    .map((chunk) => {
      const denseScore = chunk.denseScore ?? chunk.score ?? 0;
      const lexicalScore = chunk.lexicalScore ?? 0;
      const hybridScore = hybridEnabled
        ? Number((hybridAlpha * denseScore + (1 - hybridAlpha) * lexicalScore).toFixed(6))
        : denseScore;
      return {
        ...chunk,
        denseScore,
        lexicalScore,
        hybridScore,
        score: hybridScore,
      };
    })
    .filter((chunk) => chunk.score >= MIN_SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  const preRerank = hybridRanked.slice(0, rerankCandidates);
  const relevant = rerankEnabled
    ? getReranker().rerank(question, preRerank, topK)
    : preRerank.slice(0, topK);

  const latencyMs = Date.now() - startMs;

  logger.debug(
    {
      orgId,
      documentId,
      docType,
      topK,
      returned: relevant.length,
      denseCandidates: denseCandidates.length,
      lexicalCandidates: lexicalCandidates.length,
      hybridEnabled,
      rerankEnabled,
      latencyMs,
    },
    '[RAG] Retrieval complete',
  );

  return { chunks: relevant, latencyMs };
}

/**
 * Check whether the vector store has any indexed content for this org.
 * Useful for early "no documents" short-circuit.
 */
export async function hasIndexedContent(orgId: string): Promise<boolean> {
  const vectorStore = getVectorStore();
  const count = await vectorStore.count(orgId);
  return count > 0;
}
