import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  ragDoc: null as null | { id: string; orgId: string; userId: string; title: string; filename: string; mimeType: string; docType: string; metadata: unknown },
  versions: [] as Array<{ id: string; documentId: string; version: number; contentHash: string; content: string; isActive: boolean }>,
  chunks: [] as Array<{ id: string; versionId: string; chunkIndex: number }>,
  vectorUpserts: 0,
  deactivatedCount: 0,
};

vi.mock('../../infra/db.js', () => ({
  db: {
    ragDocument: {
      findFirst: vi.fn(async ({ where }) => (state.ragDoc && (!where?.id || state.ragDoc.id === where.id) ? state.ragDoc : null)),
      create: vi.fn(async ({ data }) => {
        state.ragDoc = { id: 'rag-1', ...data };
        return state.ragDoc;
      }),
      update: vi.fn(async ({ data }) => {
        state.ragDoc = state.ragDoc ? { ...state.ragDoc, ...data } : null;
        return state.ragDoc;
      }),
    },
    documentVersion: {
      findFirst: vi.fn(async ({ where, orderBy }) => {
        const matches = state.versions.filter((v) => v.documentId === where.documentId && (where.isActive === undefined || v.isActive === where.isActive));
        if (!matches.length) return null;
        if (orderBy?.version === 'desc') return [...matches].sort((a, b) => b.version - a.version)[0]!;
        return matches[0]!;
      }),
      count: vi.fn(async ({ where }) => state.versions.filter((v) => v.documentId === where.documentId).length),
      updateMany: vi.fn(async ({ where }) => {
        let count = 0;
        for (const version of state.versions) {
          if (version.documentId === where.documentId && version.isActive === where.isActive) {
            version.isActive = false;
            count++;
          }
        }
        state.deactivatedCount += count;
        return { count };
      }),
      create: vi.fn(async ({ data }) => {
        const created = { id: `ver-${data.version}`, ...data };
        state.versions.push(created);
        return created;
      }),
    },
    documentChunk: {
      deleteMany: vi.fn(async ({ where }) => {
        state.chunks = state.chunks.filter((c) => c.versionId !== where.versionId);
        return { count: 0 };
      }),
      createMany: vi.fn(async ({ data }) => {
        state.chunks.push(
          ...data.map((c: { versionId: string; chunkIndex: number }, idx: number) => ({
            id: `chunk-${idx}`,
            versionId: c.versionId,
            chunkIndex: c.chunkIndex,
          })),
        );
        return { count: data.length };
      }),
      findMany: vi.fn(async ({ where }) =>
        state.chunks.filter((c) => c.versionId === where.versionId).map((c) => ({ id: c.id, chunkIndex: c.chunkIndex })),
      ),
    },
  },
}));

vi.mock('../ingest/parser.js', () => ({
  getParser: () => ({
    parse: vi.fn(() => [{ heading: 'H1', content: 'Clause text', pageStart: 1, pageEnd: 1 }]),
  }),
}));

vi.mock('../ingest/chunker.js', () => ({
  defaultChunker: {
    chunk: vi.fn(() => [{ chunkIndex: 0, sectionLabel: 'H1', content: 'Clause text', tokenCount: 2, contentHash: 'chunk-hash' }]),
  },
}));

vi.mock('../ingest/embedder.js', () => ({
  getEmbeddingProvider: () => ({
    embedBatch: vi.fn(async () => [[0.1, 0.2, 0.3]]),
  }),
}));

vi.mock('../ingest/vectorStore.js', () => ({
  getVectorStore: () => ({
    upsert: vi.fn(async () => {
      state.vectorUpserts += 1;
    }),
    deleteByDocument: vi.fn(),
  }),
}));

import { ingestDocument } from '../ingest/ingestionService.js';

describe('IngestionService idempotency/versioning', () => {
  beforeEach(() => {
    state.ragDoc = null;
    state.versions = [];
    state.chunks = [];
    state.vectorUpserts = 0;
    state.deactivatedCount = 0;
  });

  it('skips re-embedding when active version has identical content hash', async () => {
    const input = {
      content: 'same contract content',
      meta: { orgId: 'org-1', userId: 'u-1', title: 'NDA', filename: 'nda.txt', docType: 'CONTRACT' as const },
    };

    const first = await ingestDocument(input);
    const second = await ingestDocument(input);

    expect(first.status).toBe('INDEXED');
    expect(second.status).toBe('INDEXED');
    expect(second.chunksIndexed).toBe(0);
    expect(second.versionId).toBe(first.versionId);
    expect(state.vectorUpserts).toBe(1);
  });

  it('creates a new active version and deactivates previous version when content changes', async () => {
    await ingestDocument({
      content: 'version one',
      meta: { orgId: 'org-1', userId: 'u-1', title: 'NDA', filename: 'nda.txt', docType: 'CONTRACT' },
    });

    const second = await ingestDocument({
      content: 'version two',
      meta: { orgId: 'org-1', userId: 'u-1', title: 'NDA', filename: 'nda.txt', docType: 'CONTRACT' },
    });

    expect(second.status).toBe('INDEXED');
    expect(state.versions.length).toBe(2);
    expect(state.versions.filter((v) => v.isActive)).toHaveLength(1);
    expect(state.deactivatedCount).toBeGreaterThan(0);
  });
});
