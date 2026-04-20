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
  const {
    orgId,
    userId,
    logicalDocumentId,
    title,
    filename,
    mimeType = 'text/plain',
    docType = 'OTHER',
  } = meta;

  const startMs = Date.now();
  let documentId: string | null = null;
  let documentTitle = title;

  try {
    const contentHash = sha256(content);

    // -----------------------------------------------------------------------
    // 1. Resolve logical RagDocument for versioned ingest
    // -----------------------------------------------------------------------
    let ragDoc = logicalDocumentId
      ? await db.ragDocument.findFirst({ where: { id: logicalDocumentId, orgId } })
      : await db.ragDocument.findFirst({
          where: { orgId, filename, title, docType },
          orderBy: { createdAt: 'desc' },
        });

    if (!ragDoc) {
      ragDoc = await db.ragDocument.create({
        data: {
          orgId,
          userId,
          title,
          filename,
          mimeType,
          sizeBytes: Buffer.byteLength(content, 'utf8'),
          docType,
          status: 'INGESTING',
          metadata: (meta.extra ?? {}) as object,
        },
      });
    } else {
      ragDoc = await db.ragDocument.update({
        where: { id: ragDoc.id },
        data: {
          userId,
          title,
          filename,
          mimeType,
          sizeBytes: Buffer.byteLength(content, 'utf8'),
          docType,
          status: 'INGESTING',
          metadata: (meta.extra ?? ragDoc.metadata ?? {}) as object,
        },
      });
    }
    const currentDocumentId = ragDoc.id;
    documentId = currentDocumentId;
    documentTitle = ragDoc.title;

    // -----------------------------------------------------------------------
    // 2. Resolve existing active version + idempotency
    // -----------------------------------------------------------------------
    const activeVersion = await db.documentVersion.findFirst({
      where: { documentId: currentDocumentId, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (activeVersion?.contentHash === contentHash) {
      logger.info(
        { documentId: currentDocumentId, versionId: activeVersion.id, contentHash },
        '[RAG] Skipping ingest – identical active content already indexed',
      );
      await db.ragDocument.update({
        where: { id: currentDocumentId },
        data: { status: 'INDEXED' },
      });
      return {
        documentId: currentDocumentId,
        versionId: activeVersion.id,
        status: 'INDEXED',
        chunksIndexed: 0,
      };
    }
    const existing = await db.documentVersion.count({ where: { documentId: currentDocumentId } });
    const versionNumber = existing + 1;

    await db.documentVersion.updateMany({
      where: { documentId: currentDocumentId, isActive: true },
      data: { isActive: false },
    });

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
    await db.documentChunk.deleteMany({ where: { versionId } });
    await db.documentChunk.createMany({
      data: chunks.map((chunk, i) => ({
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
        embedding: embeddings[i] as unknown as object,
      })),
    });
    const dbChunks = await db.documentChunk.findMany({
      where: { versionId },
      select: { id: true, chunkIndex: true },
    });
    const idByChunkIndex = new Map<number, string>(
      dbChunks.map((c: { id: string; chunkIndex: number }) => [c.chunkIndex, c.id]),
    );

    const vectorEntries: VectorStoreEntry[] = chunks.map((chunk, i) => ({
      id: idByChunkIndex.get(chunk.chunkIndex) ?? '',
      orgId,
      documentId: currentDocumentId,
      documentTitle,
      docType,
      versionId,
      version: versionNumber,
      isActiveVersion: true,
      chunk: { ...chunk, embedding: embeddings[i]! },
    })).filter((entry) => entry.id);

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
      logicalDocumentId: doc.id,
      title: doc.title,
      filename: doc.filename,
      mimeType: doc.mimeType,
      docType: doc.docType as import('./types.js').RagDocumentType,
      extra: (doc.metadata ?? {}) as Record<string, unknown>,
    },
  });
}
