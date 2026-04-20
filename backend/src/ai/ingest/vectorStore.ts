/**
 * VectorStore implementations.
 * * pgvector integration enabled! 🚀
 */

import type {
  VectorStore,
  VectorStoreEntry,
  VectorStoreFilter,
  RetrievedChunk,
} from './types.js';
import logger from '../../infra/logger.js';

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ---------------------------------------------------------------------------
// InMemoryVectorStore (Same as before for local testing)
// ---------------------------------------------------------------------------
export class InMemoryVectorStore implements VectorStore {
  private readonly _store = new Map<string, VectorStoreEntry>();

  get size(): number {
    return this._store.size;
  }

  async upsert(entries: VectorStoreEntry[]): Promise<void> {
    for (const entry of entries) {
      this._store.set(entry.id, entry);
    }
  }

  async query(queryEmbedding: number[], filter: VectorStoreFilter, topK = 8): Promise<RetrievedChunk[]> {
    const safeTopK = Number.isFinite(topK) ? Math.max(0, Math.floor(topK)) : 8;
    if (safeTopK === 0) return [];
    const threshold = filter.threshold ?? -1;
    const docIds = filter.documentIds && filter.documentIds.length > 0
      ? new Set(filter.documentIds)
      : undefined;

    const results: RetrievedChunk[] = [];
    for (const entry of this._store.values()) {
      if (entry.orgId !== filter.orgId) continue;
      if (filter.documentId && entry.documentId !== filter.documentId) continue;
      if (docIds && !docIds.has(entry.documentId)) continue;
      if (filter.versionId && entry.versionId !== filter.versionId) continue;
      if (filter.docType && entry.docType !== filter.docType) continue;
      if (entry.isActiveVersion === false) continue;

      const score = cosineSimilarity(queryEmbedding, entry.chunk.embedding);
      if (score < threshold) continue;

      results.push({
        ...entry.chunk,
        documentId: entry.documentId,
        documentTitle: entry.documentTitle,
        versionId: entry.versionId,
        version: entry.version,
        orgId: entry.orgId,
        score,
      });
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, safeTopK);
  }

  async deleteByDocument(documentId: string, orgId: string): Promise<void> {
    for (const [key, entry] of this._store.entries()) {
      if (entry.documentId === documentId && entry.orgId === orgId) this._store.delete(key);
    }
  }

  async count(orgId: string): Promise<number> {
    let n = 0;
    for (const entry of this._store.values()) if (entry.orgId === orgId) n++;
    return n;
  }
}

// ---------------------------------------------------------------------------
// Prisma + pgvector Store (The Enterprise "Sher" Version)
// ---------------------------------------------------------------------------

export class PrismaVectorStore implements VectorStore {
  
  /**
   * Embeddings ko naye 'embedding_vec' column mein save karta hai
   */
  async upsert(entries: VectorStoreEntry[]): Promise<void> {
    const { db } = await import('../../infra/db.js');
    
    for (const entry of entries) {
      const vectorSql = `[${entry.chunk.embedding.join(',')}]`;
      
      // SQL query to update the vector column specifically
      await db.$executeRawUnsafe(
        `UPDATE "DocumentChunk" SET "embedding_vec" = $1::vector WHERE id = $2`,
        vectorSql,
        entry.id
      );
    }
  }

  /**
   * Asli magic: Database side similarity search using <=> (cosine distance)
   */
  async query(
    queryEmbedding: number[],
    filter: VectorStoreFilter,
    topK = 8,
  ): Promise<RetrievedChunk[]> {
    const safeTopK = Number.isFinite(topK) ? Math.max(0, Math.floor(topK)) : 8;
    if (safeTopK === 0) return [];
    const { db } = await import('../../infra/db.js');
    const vectorSql = `[${queryEmbedding.join(',')}]`;
    const threshold = filter.threshold ?? -1;
    const docIds = filter.documentIds && filter.documentIds.length > 0 ? filter.documentIds : null;

    // pgvector query: <=> operator calculates cosine distance
    // 1 - (distance) gives us the similarity score
    const results = await db.$queryRawUnsafe<Array<{
      chunkIndex: number;
      sectionLabel: string | null;
      pageStart: number | null;
      pageEnd: number | null;
      content: string;
      tokenCount: number;
      contentHash: string;
      embedding: unknown;
      documentId: string;
      versionId: string;
      orgId: string;
      documentTitle: string;
      versionName: number;
      similarity_score: number;
    }>>(
      `
      SELECT 
        c."chunkIndex",
        c."sectionLabel",
        c."pageStart",
        c."pageEnd",
        c."content",
        c."tokenCount",
        c."contentHash",
        c."embedding",
        c."documentId",
        c."versionId",
        c."orgId",
        d.title as "documentTitle",
        v.version as "versionName",
        1 - (c.embedding_vec <=> $1::vector) as similarity_score
      FROM "DocumentChunk" c
      JOIN "RagDocument" d ON c."documentId" = d.id
      JOIN "DocumentVersion" v ON c."versionId" = v.id
      WHERE c."embedding_vec" IS NOT NULL
        AND c."orgId" = $2
        AND d."orgId" = $2
        AND d."status" = 'INDEXED'
        AND v."isActive" = true
        ${filter.documentId ? `AND c."documentId" = $3` : ''}
        ${docIds ? 'AND c."documentId" = ANY($4::text[])' : ''}
        ${filter.docType ? `AND d."docType" = $5::"RagDocumentType"` : ''}
      ORDER BY c.embedding_vec <=> $1::vector
      LIMIT $6
      `,
      vectorSql,
      filter.orgId,
      filter.documentId ?? null,
      docIds,
      filter.docType ?? null,
      safeTopK,
    );

    return results
      .map((row: {
        chunkIndex: number;
        sectionLabel: string | null;
        pageStart: number | null;
        pageEnd: number | null;
        content: string;
        tokenCount: number;
        contentHash: string;
        embedding: unknown;
        documentId: string;
        documentTitle: string;
        versionId: string;
        versionName: number;
        similarity_score: number;
        orgId: string;
      }) => {
        if (!Array.isArray(row.embedding)) {
          logger.warn(
            { documentId: row.documentId, versionId: row.versionId, chunkIndex: row.chunkIndex },
            '[RAG] Skipping chunk with malformed embedding payload',
          );
          return null;
        }
        return {
        chunkIndex: row.chunkIndex,
        sectionLabel: row.sectionLabel ?? undefined,
        pageStart: row.pageStart ?? undefined,
        pageEnd: row.pageEnd ?? undefined,
        content: row.content,
        tokenCount: row.tokenCount,
        contentHash: row.contentHash,
        embedding: Array.isArray(row.embedding) ? (row.embedding as number[]) : [],
        documentId: row.documentId,
        documentTitle: row.documentTitle,
        versionId: row.versionId,
        version: row.versionName,
        score: row.similarity_score,
        orgId: row.orgId,
        };
      })
      .filter((row): row is RetrievedChunk => row !== null)
      .filter((row: RetrievedChunk) => row.score >= threshold);
  }

  async deleteByDocument(documentId: string, orgId: string): Promise<void> {
    const { db } = await import('../../infra/db.js');
    await db.$executeRawUnsafe(
      'DELETE FROM "DocumentChunk" WHERE "documentId" = $1 AND "orgId" = $2',
      documentId,
      orgId,
    );
  }

  async count(orgId: string): Promise<number> {
    const { db } = await import('../../infra/db.js');
    const result = await db.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "DocumentChunk" WHERE "orgId" = $1',
      orgId,
    );
    return Number(result[0]?.count ?? 0n);
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
    _storeInstance = new InMemoryVectorStore();
  }
  return _storeInstance;
}

export function resetVectorStore(): void {
  _storeInstance = null;
}
