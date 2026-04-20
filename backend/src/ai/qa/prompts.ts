/**
 * Prompt templates for legal RAG Q&A.
 *
 * Guardrails enforced in every prompt:
 *  - Answer ONLY from the provided context passages.
 *  - If context is insufficient, respond with a structured "insufficient evidence" reply.
 *  - Never claim uncited facts.
 *  - Every factual claim must reference the provided source indices.
 */

import type { RetrievedChunk } from '../ingest/types.js';

const DEFAULT_MAX_CONTEXT_TOKENS = Number(process.env.RAG_MAX_CONTEXT_TOKENS ?? 1800);
const DEFAULT_MAX_CONTEXT_CHUNKS = Number(process.env.RAG_MAX_CONTEXT_CHUNKS ?? 8);

export function selectChunksForPrompt(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const selected: RetrievedChunk[] = [];
  let usedTokens = 0;

  for (const chunk of chunks) {
    if (selected.length >= DEFAULT_MAX_CONTEXT_CHUNKS) break;
    const tokenCount = Math.max(1, chunk.tokenCount || Math.ceil(chunk.content.length / 4));
    if (usedTokens + tokenCount > DEFAULT_MAX_CONTEXT_TOKENS) continue;
    selected.push(chunk);
    usedTokens += tokenCount;
  }

  return selected;
}

/**
 * Build the system instruction for the legal Q&A prompt.
 */
export function systemInstruction(): string {
  return `You are a precise legal document assistant.

Rules you MUST follow:
1. Answer ONLY from the provided context passages. Do not use external knowledge.
2. If the context does not contain enough information, say exactly:
   "INSUFFICIENT_EVIDENCE: The provided documents do not contain enough information to answer this question."
3. Cite every factual claim using [SOURCE n] markers, where n is the passage index.
4. Be concise and professional. Do not speculate or infer beyond the text.
5. If multiple passages are relevant, cite all of them.`;
}

/**
 * Build the user-facing prompt with retrieved context.
 */
export function buildContextPrompt(question: string, chunks: RetrievedChunk[]): string {
  const passageBlock = chunks
    .map(
      (c, i) =>
        `[SOURCE ${i + 1}] (Document: "${c.documentTitle}", Section: "${c.sectionLabel ?? 'N/A'}", Score: ${c.score.toFixed(3)})\n${c.content}`,
    )
    .join('\n\n---\n\n');

  return `Context passages:\n\n${passageBlock}\n\n---\n\nQuestion: ${question}\n\nAnswer (cite [SOURCE n] for every factual claim):`;
}

/** Marker string used by the insufficient-evidence guard. */
export const INSUFFICIENT_EVIDENCE_MARKER = 'INSUFFICIENT_EVIDENCE:';
