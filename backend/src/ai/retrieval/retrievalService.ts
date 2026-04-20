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
  const chunks = await vectorStore.query(queryEmbedding, filter, topK);
  const relevant = chunks;

  const latencyMs = Date.now() - startMs;

  logger.debug(
    { orgId, documentId, docType, topK, returned: relevant.length, latencyMs },
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
