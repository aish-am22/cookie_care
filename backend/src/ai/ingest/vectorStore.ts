/**
 * VectorStore implementations.
 *
 * InMemoryVectorStore  – dev/test default, no external dependencies.
 * PrismaVectorStore    – persists embeddings in DocumentChunk.embedding (JSON).
 *                        Suitable for moderate corpus sizes without pgvector.
 *
 * TODO: Add PineconeVectorStore / pgvector adapter when RAG_VECTOR_STORE=pinecone|pgvector.
 */

import type {
  VectorStore,
  VectorStoreEntry,
  VectorStoreFilter,
  RetrievedChunk,
} from './types.js';
import { Prisma } from '@prisma/client';

// ---------------------------------------------------------------------------
// Cosine similarity helper
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// InMemoryVectorStore
// ---------------------------------------------------------------------------

/**
 * Simple in-memory vector store backed by a Map.
 * Suitable for development and testing without any external vector DB.
 * State is lost on server restart.
 */
export class InMemoryVectorStore implements VectorStore {
  private readonly _store = new Map<string, VectorStoreEntry>();

  async upsert(entries: VectorStoreEntry[]): Promise<void> {
    for (const entry of entries) {
      this._store.set(entry.id, entry);
    }
  }

  async query(
    queryEmbedding: number[],
    filter: VectorStoreFilter,
    topK = 8,
  ): Promise<RetrievedChunk[]> {
    const candidates: Array<{ entry: VectorStoreEntry; score: number }> = [];

    for (const entry of this._store.values()) {
      // Mandatory tenant isolation
      if (entry.orgId !== filter.orgId) continue;
      // Optional filters
      if (filter.documentId && entry.documentId !== filter.documentId) continue;
      if (filter.versionId && entry.versionId !== filter.versionId) continue;

      const score = cosineSimilarity(queryEmbedding, entry.chunk.embedding);
      candidates.push({ entry, score });
    }

    // Sort descending by score and take top-k
    candidates.sort((a, b) => b.score - a.score);

    return candidates.slice(0, topK).map(({ entry, score }) => ({
      ...entry.chunk,
      documentId: entry.documentId,
      documentTitle: entry.documentTitle,
      versionId: entry.versionId,
      version: entry.version,
      score,
      orgId: entry.orgId,
    }));
  }

  async deleteByDocument(documentId: string, orgId: string): Promise<void> {
    for (const [key, entry] of this._store.entries()) {
      if (entry.documentId === documentId && entry.orgId === orgId) {
        this._store.delete(key);
      }
    }
  }

  async count(orgId: string): Promise<number> {
    let n = 0;
    for (const entry of this._store.values()) {
      if (entry.orgId === orgId) n++;
    }
    return n;
  }

  /** Expose entry count for testing. */
  get size(): number {
    return this._store.size;
  }
}

// ---------------------------------------------------------------------------
// PrismaVectorStore
// ---------------------------------------------------------------------------

/**
 * Stores and retrieves embeddings from the DocumentChunk table in Postgres.
 *
 * Similarity is computed in-process (loads matching chunks into memory then
 * scores them).  This works well for small-to-medium corpora.
 *
 * TODO: Replace with pgvector's <=> operator for large-scale production use.
 */
export class PrismaVectorStore implements VectorStore {
  async upsert(entries: VectorStoreEntry[]): Promise<void> {
    const { db } = await import('../../infra/db.js');
    await Promise.all(
      entries.map((entry) =>
        db.documentChunk.update({
          where: { id: entry.id },
          data: { embedding: entry.chunk.embedding as unknown as import('@prisma/client').Prisma.JsonArray },
        }),
      ),
    );
  }

  async query(
    queryEmbedding: number[],
    filter: VectorStoreFilter,
    topK = 8,
  ): Promise<RetrievedChunk[]> {
    const { db } = await import('../../infra/db.js');

    const rows = await db.documentChunk.findMany({
      where: {
        orgId: filter.orgId,
        ...(filter.documentId ? { documentId: filter.documentId } : {}),
        ...(filter.versionId ? { versionId: filter.versionId } : {}),
      },
      include: { document: { select: { title: true } }, version: { select: { version: true } } },
    });

    const scored = rows
      .map((row) => {
        const vec = row.embedding as number[] | null;
        if (!vec || !Array.isArray(vec)) return null;
        const score = cosineSimilarity(queryEmbedding, vec);
        return { row, score };
      })
      .filter((x): x is { row: typeof rows[number]; score: number } => x !== null);

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK).map(({ row, score }) => ({
      chunkIndex: row.chunkIndex,
      sectionLabel: row.sectionLabel ?? undefined,
      pageStart: row.pageStart ?? undefined,
      pageEnd: row.pageEnd ?? undefined,
      content: row.content,
      tokenCount: row.tokenCount,
      contentHash: row.contentHash,
      embedding: row.embedding as number[],
      documentId: row.documentId,
      documentTitle: row.document.title,
      versionId: row.versionId,
      version: row.version.version,
      score,
      orgId: row.orgId,
    }));
  }

  async deleteByDocument(documentId: string, orgId: string): Promise<void> {
    const { db } = await import('../../infra/db.js');
    await db.documentChunk.deleteMany({ where: { documentId, orgId } });
  }

  async count(orgId: string): Promise<number> {
    const { db } = await import('../../infra/db.js');
    return db.documentChunk.count({ where: { orgId } });
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

let _storeInstance: VectorStore | null = null;

export function getVectorStore(): VectorStore {
  if (_storeInstance) return _storeInstance;

  const storeType = process.env.RAG_VECTOR_STORE ?? 'memory';

  if (storeType === 'prisma') {
    _storeInstance = new PrismaVectorStore();
  } else {
    if (storeType !== 'memory') {
      console.warn(
        `[RAG] Unknown RAG_VECTOR_STORE="${storeType}". Falling back to in-memory store.`,
      );
    }
    _storeInstance = new InMemoryVectorStore();
  }

  return _storeInstance;
}

/** Reset the cached store (useful in tests). */
export function resetVectorStore(): void {
  _storeInstance = null;
}
