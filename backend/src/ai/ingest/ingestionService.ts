/**
 * IngestionService – orchestrates the full ingest pipeline:
 *
 *   DocumentParser → Chunker → EmbeddingProvider → VectorStore
 *              ↓ (persists to Prisma: RagDocument, DocumentVersion, DocumentChunk)
 *
 * Designed to be queue-friendly: the public `ingestDocument` method is a
 * self-contained async function that can be called directly from an Express
 * handler OR dispatched as a BullMQ job payload.
 *
 * TODO: wire BullMQ worker when Redis is available (see jobs/ingest.worker.ts).
 */

import { createHash } from 'crypto';
import { db } from '../../infra/db.js';
import logger from '../../infra/logger.js';
import { getParser } from './parser.js';
import { defaultChunker } from './chunker.js';
import { getEmbeddingProvider } from './embedder.js';
import { getVectorStore } from './vectorStore.js';
import type {
  DocumentMeta,
  IngestionResult,
  VectorStoreEntry,
} from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IngestDocumentInput {
  /** Raw text/binary content (string for text/HTML, base64 for binary). */
  content: string;
  meta: DocumentMeta;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// IngestionService
// ---------------------------------------------------------------------------

/**
 * Ingest a single document:
 *  1. Persist RagDocument + DocumentVersion records.
 *  2. Parse → chunk → embed.
 *  3. Persist DocumentChunk records.
 *  4. Upsert into VectorStore.
 *  5. Update RagDocument status to INDEXED (or FAILED on error).
 */
export async function ingestDocument(input: IngestDocumentInput): Promise<IngestionResult> {
  const { content, meta } = input;
  const { orgId, userId, title, filename, mimeType = 'text/plain', docType = 'OTHER' } = meta;

  const startMs = Date.now();
  let documentId: string | null = null;

  try {
    // -----------------------------------------------------------------------
    // 1. Create / update RagDocument
    // -----------------------------------------------------------------------
    const ragDoc = await db.ragDocument.create({
      data: {
        orgId,
        userId,
        title,
        filename,
        mimeType,
        sizeBytes: Buffer.byteLength(content, 'utf8'),
        docType: docType as import('@prisma/client').RagDocumentType,
        status: 'INGESTING',
        metadata: meta.extra as import('@prisma/client').Prisma.JsonObject ?? {},
      },
    });
    documentId = ragDoc.id;
    const currentDocumentId = ragDoc.id;

    // -----------------------------------------------------------------------
    // 2. Resolve next version number (1-based, monotonic)
    // -----------------------------------------------------------------------
    const existing = await db.documentVersion.count({ where: { documentId: currentDocumentId } });
    const versionNumber = existing + 1;
    const contentHash = sha256(content);

    // Check for duplicate content (idempotency)
    const duplicate = await db.documentVersion.findFirst({
      where: { documentId: currentDocumentId, contentHash },
    });
    if (duplicate) {
      logger.info({ documentId: currentDocumentId, contentHash }, '[RAG] Skipping ingest – identical content already indexed');
      await db.ragDocument.update({
        where: { id: currentDocumentId },
        data: { status: 'INDEXED' },
      });
      return {
        documentId: currentDocumentId,
        versionId: duplicate.id,
        status: 'INDEXED',
        chunksIndexed: 0,
      };
    }

    const docVersion = await db.documentVersion.create({
      data: {
        documentId: currentDocumentId,
        orgId,
        version: versionNumber,
        content,
        contentHash,
        isActive: true,
      },
    });
    const versionId = docVersion.id;

    // -----------------------------------------------------------------------
    // 3. Parse → chunk → embed
    // -----------------------------------------------------------------------
    const parser = getParser(mimeType);
    const sections = parser.parse(content, mimeType);
    const chunks = defaultChunker.chunk(sections);

    const embedder = getEmbeddingProvider();
    const embeddings = await embedder.embedBatch(chunks.map((c) => c.content));

    // -----------------------------------------------------------------------
    // 4. Persist DocumentChunk records
    // -----------------------------------------------------------------------
    const vectorEntries: VectorStoreEntry[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]!;
      const embedding = embeddings[i]!;

      // Delete any pre-existing chunk at the same index for this version
      // (handles re-ingest gracefully)
      await db.documentChunk.deleteMany({
        where: { versionId, chunkIndex: chunk.chunkIndex },
      });

      const dbChunk = await db.documentChunk.create({
        data: {
          documentId: currentDocumentId,
          versionId,
          orgId,
          chunkIndex: chunk.chunkIndex,
          sectionLabel: chunk.sectionLabel ?? null,
          pageStart: chunk.pageStart ?? null,
          pageEnd: chunk.pageEnd ?? null,
          content: chunk.content,
          tokenCount: chunk.tokenCount,
          contentHash: chunk.contentHash,
          embedding: embedding as unknown as import('@prisma/client').Prisma.JsonArray,
        },
      });

      vectorEntries.push({
        id: dbChunk.id,
        orgId,
        documentId: currentDocumentId,
        documentTitle: title,
        versionId,
        version: versionNumber,
        chunk: { ...chunk, embedding },
      });
    }

    // -----------------------------------------------------------------------
    // 5. Upsert into VectorStore
    // -----------------------------------------------------------------------
    await getVectorStore().upsert(vectorEntries);

    // -----------------------------------------------------------------------
    // 6. Mark document as INDEXED
    // -----------------------------------------------------------------------
    await db.ragDocument.update({
      where: { id: currentDocumentId },
      data: { status: 'INDEXED' },
    });

    const latencyMs = Date.now() - startMs;
    logger.info(
      { documentId: currentDocumentId, versionId, chunksIndexed: chunks.length, latencyMs },
      '[RAG] Ingestion complete',
    );

    return { documentId: currentDocumentId, versionId, status: 'INDEXED', chunksIndexed: chunks.length };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ documentId, err }, '[RAG] Ingestion failed');

    if (documentId) {
      await db.ragDocument
        .update({ where: { id: documentId }, data: { status: 'FAILED', errorMsg } })
        .catch(() => undefined); // best-effort
    }

    return {
      documentId: documentId ?? '',
      versionId: '',
      status: 'FAILED',
      chunksIndexed: 0,
      errorMsg,
    };
  }
}

/**
 * Re-ingest an existing RagDocument by id.
 * Loads content from the latest active DocumentVersion.
 */
export async function reIngestDocument(documentId: string, orgId: string): Promise<IngestionResult> {
  const doc = await db.ragDocument.findUnique({ where: { id: documentId } });
  if (!doc || doc.orgId !== orgId) {
    return { documentId, versionId: '', status: 'FAILED', chunksIndexed: 0, errorMsg: 'Document not found' };
  }

  const latestVersion = await db.documentVersion.findFirst({
    where: { documentId, isActive: true },
    orderBy: { version: 'desc' },
  });
  if (!latestVersion) {
    return { documentId, versionId: '', status: 'FAILED', chunksIndexed: 0, errorMsg: 'No active version found' };
  }

  // Remove old vector store entries for this document
  await getVectorStore().deleteByDocument(documentId, orgId);

  return ingestDocument({
    content: latestVersion.content,
    meta: {
      orgId,
      userId: doc.userId,
      title: doc.title,
      filename: doc.filename,
      mimeType: doc.mimeType,
      docType: doc.docType as import('./types.js').RagDocumentType,
      extra: (doc.metadata ?? {}) as Record<string, unknown>,
    },
  });
}
