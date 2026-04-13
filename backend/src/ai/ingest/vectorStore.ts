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
    // ... (Your existing in-memory logic) ...
    return []; // Shortened for brevity, keep your original if needed
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
    const { db } = await import('../../infra/db.js');
    const vectorSql = `[${queryEmbedding.join(',')}]`;

    // pgvector query: <=> operator calculates cosine distance
    // 1 - (distance) gives us the similarity score
    const results = await db.$queryRawUnsafe<any[]>(
      `
      SELECT 
        c.*, 
        d.title as "documentTitle",
        v.version as "versionName",
        1 - (c.embedding_vec <=> $1::vector) as similarity_score
      FROM "DocumentChunk" c
      JOIN "ContractDocument" d ON c."documentId" = d.id
      JOIN "DocumentVersion" v ON c."versionId" = v.id
      WHERE c."orgId" = $2
        ${filter.documentId ? `AND c."documentId" = $3` : ''}
      ORDER BY c.embedding_vec <=> $1::vector
      LIMIT $4
      `,
      vectorSql,
      filter.orgId,
      filter.documentId || '',
      topK
    );

    return results.map((row) => ({
      chunkIndex: row.chunkIndex,
      sectionLabel: row.sectionLabel,
      pageStart: row.pageStart,
      pageEnd: row.pageEnd,
      content: row.content,
      tokenCount: row.tokenCount,
      contentHash: row.contentHash,
      embedding: row.embedding, // original json for compatibility
      documentId: row.documentId,
      documentTitle: row.documentTitle,
      versionId: row.versionId,
      version: row.versionName,
      score: row.similarity_score,
      orgId: row.orgId,
    }));
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