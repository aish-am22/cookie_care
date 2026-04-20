/**
 * Tests for RetrievalService:
 *  - mandatory orgId isolation (chunks from other orgs must never be returned)
 *  - documentId filter narrows results
 *  - empty store returns empty results
 *  - results are ordered by score descending
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryVectorStore, getVectorStore, resetVectorStore } from '../ingest/vectorStore.js';
import { StubEmbeddingProvider, resetEmbeddingProvider } from '../ingest/embedder.js';
import { clampTopK, MAX_TOP_K, MIN_TOP_K, retrieve } from '../retrieval/retrievalService.js';
import type { VectorStoreEntry, EmbeddedChunk } from '../ingest/types.js';

// ---------------------------------------------------------------------------
// Helpers – build test entries without needing a live DB
// ---------------------------------------------------------------------------

function makeChunk(index: number, content: string): EmbeddedChunk {
  const embedder = new StubEmbeddingProvider(64);
  // Synchronous stub – use the underlying method directly
  return {
    chunkIndex: index,
    content,
    tokenCount: content.split(/\s+/).length,
    contentHash: `hash-${index}`,
    embedding: (embedder as unknown as { _deterministicVector(t: string): number[] })._deterministicVector(content),
  };
}

function makeEntry(
  id: string,
  orgId: string,
  documentId: string,
  chunkIndex: number,
  content: string,
  docType: 'CONTRACT' | 'POLICY' | 'OTHER' = 'OTHER',
): VectorStoreEntry {
  return {
    id,
    orgId,
    documentId,
    documentTitle: `Doc ${documentId}`,
    docType,
    versionId: `v-${documentId}`,
    version: 1,
    isActiveVersion: true,
    chunk: makeChunk(chunkIndex, content),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InMemoryVectorStore – tenant isolation', () => {
  let store: InMemoryVectorStore;

  beforeEach(() => {
    store = new InMemoryVectorStore();
  });

  it('returns empty results when store is empty', async () => {
    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('test query');
    const results = await store.query(qVec, { orgId: 'org-1' });
    expect(results).toEqual([]);
  });

  it('never returns chunks from a different org (tenant isolation)', async () => {
    await store.upsert([
      makeEntry('c1', 'org-A', 'doc-1', 0, 'Confidentiality clause for org A'),
      makeEntry('c2', 'org-B', 'doc-2', 0, 'Confidentiality clause for org B'),
    ]);

    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('confidentiality clause');

    const resultsA = await store.query(qVec, { orgId: 'org-A' });
    const resultsB = await store.query(qVec, { orgId: 'org-B' });

    expect(resultsA.every((r) => r.orgId === 'org-A')).toBe(true);
    expect(resultsB.every((r) => r.orgId === 'org-B')).toBe(true);
    expect(resultsA.length).toBe(1);
    expect(resultsB.length).toBe(1);
  });

  it('returns nothing when query is for an org with no indexed content', async () => {
    await store.upsert([makeEntry('c1', 'org-A', 'doc-1', 0, 'Some clause')]);

    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('clause');
    const results = await store.query(qVec, { orgId: 'org-unknown' });
    expect(results).toEqual([]);
  });

  it('documentId filter restricts results to that document only', async () => {
    await store.upsert([
      makeEntry('c1', 'org-A', 'doc-1', 0, 'Clause from doc one'),
      makeEntry('c2', 'org-A', 'doc-2', 0, 'Clause from doc two'),
    ]);

    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('clause from doc');

    const results = await store.query(qVec, { orgId: 'org-A', documentId: 'doc-1' });
    expect(results.every((r) => r.documentId === 'doc-1')).toBe(true);
  });

  it('respects topK limit', async () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      makeEntry(`c${i}`, 'org-X', `doc-${i}`, i, `Content chunk ${i}`),
    );
    await store.upsert(entries);

    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('content chunk');
    const results = await store.query(qVec, { orgId: 'org-X' }, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('results are ordered by score descending', async () => {
    await store.upsert([
      makeEntry('c1', 'org-A', 'doc-1', 0, 'Alpha unique text one'),
      makeEntry('c2', 'org-A', 'doc-1', 1, 'Beta unique text two'),
      makeEntry('c3', 'org-A', 'doc-1', 2, 'Gamma unique text three'),
    ]);

    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('alpha unique text one');
    const results = await store.query(qVec, { orgId: 'org-A' });

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
    }
  });

  it('deleteByDocument removes only entries for that document within the org', async () => {
    await store.upsert([
      makeEntry('c1', 'org-A', 'doc-1', 0, 'Doc one content'),
      makeEntry('c2', 'org-A', 'doc-2', 0, 'Doc two content'),
    ]);

    await store.deleteByDocument('doc-1', 'org-A');
    expect(store.size).toBe(1);

    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('content');
    const results = await store.query(qVec, { orgId: 'org-A' });
    expect(results.every((r) => r.documentId === 'doc-2')).toBe(true);
  });

  it('count returns only entries for the specified org', async () => {
    await store.upsert([
      makeEntry('c1', 'org-A', 'doc-1', 0, 'A content'),
      makeEntry('c2', 'org-A', 'doc-1', 1, 'A content 2'),
      makeEntry('c3', 'org-B', 'doc-2', 0, 'B content'),
    ]);

    expect(await store.count('org-A')).toBe(2);
    expect(await store.count('org-B')).toBe(1);
    expect(await store.count('org-C')).toBe(0);
  });

  it('applies docType and documentIds filters', async () => {
    await store.upsert([
      makeEntry('c1', 'org-A', 'doc-1', 0, 'Clause one', 'CONTRACT'),
      makeEntry('c2', 'org-A', 'doc-2', 0, 'Clause two', 'POLICY'),
      makeEntry('c3', 'org-A', 'doc-3', 0, 'Clause three', 'CONTRACT'),
    ]);

    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('clause');
    const results = await store.query(qVec, {
      orgId: 'org-A',
      docType: 'CONTRACT',
      documentIds: ['doc-3'],
    });

    expect(results.length).toBe(1);
    expect(results[0]!.documentId).toBe('doc-3');
  });

  it('applies similarity threshold filtering', async () => {
    await store.upsert([makeEntry('c1', 'org-A', 'doc-1', 0, 'Alpha specific text')]);

    const embedder = new StubEmbeddingProvider(64);
    const qVec = await embedder.embed('completely unrelated query');
    const results = await store.query(qVec, { orgId: 'org-A', threshold: 0.95 });

    expect(results).toEqual([]);
  });

  it('listCandidates keeps org filtering and returns chunk ids', async () => {
    await store.upsert([
      makeEntry('c1', 'org-A', 'doc-1', 0, 'Alpha specific text'),
      makeEntry('c2', 'org-B', 'doc-2', 0, 'Beta text'),
    ]);
    const candidates = await store.listCandidates({ orgId: 'org-A' }, 10);
    expect(candidates.length).toBe(1);
    expect(candidates[0]?.chunkId).toBe('c1');
    expect(candidates[0]?.orgId).toBe('org-A');
  });

  it('clamps topK to server-safe bounds', () => {
    expect(clampTopK(undefined)).toBeGreaterThanOrEqual(MIN_TOP_K);
    expect(clampTopK(0)).toBe(MIN_TOP_K);
    expect(clampTopK(999)).toBe(MAX_TOP_K);
  });
});

describe('RetrievalService – hybrid + rerank', () => {
  beforeEach(() => {
    process.env.RAG_VECTOR_STORE = 'memory';
    process.env.RAG_EMBEDDING_PROVIDER = 'stub';
    process.env.RAG_HYBRID_ENABLED = 'true';
    process.env.RAG_RERANK_ENABLED = 'true';
    process.env.RAG_HYBRID_ALPHA = '0.5';
    resetVectorStore();
    resetEmbeddingProvider();
  });

  it('returns only chunks from requested org in hybrid mode', async () => {
    const store = getVectorStore() as InMemoryVectorStore;
    await store.upsert([
      makeEntry('a-1', 'org-A', 'doc-1', 0, 'Liability cap is USD 100000'),
      makeEntry('b-1', 'org-B', 'doc-2', 0, 'Liability cap is USD 200000'),
    ]);

    const result = await retrieve({ orgId: 'org-A', question: 'liability cap', topK: 5 });
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.every((c) => c.orgId === 'org-A')).toBe(true);
  });

  it('includes hybrid and rerank component scores', async () => {
    const store = getVectorStore() as InMemoryVectorStore;
    await store.upsert([
      makeEntry('a-1', 'org-A', 'doc-1', 0, 'Sub-processor notice is 30 days'),
      makeEntry('a-2', 'org-A', 'doc-1', 1, 'General boilerplate terms'),
    ]);

    const result = await retrieve({ orgId: 'org-A', question: 'sub processor notice period', topK: 2 });
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks[0]?.hybridScore).toBeTypeOf('number');
    expect(result.chunks[0]?.rerankScore).toBeTypeOf('number');
    expect(result.chunks[0]?.chunkId).toBeDefined();
  });
});
