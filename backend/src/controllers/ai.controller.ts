/**
 * AI controller – handles /api/ai/* endpoints.
 *
 * Endpoints:
 *   POST /api/ai/ingest   – ingest a text document into the RAG pipeline
 *   POST /api/ai/retrieve – debug retrieval endpoint (returns raw chunks)
 *   POST /api/ai/ask      – ask a question with citation-grade response
 */

import type { Request, Response, NextFunction } from 'express';
import { ingestDocument } from '../ai/ingest/ingestionService.js';
import { retrieve, clampTopK, MIN_TOP_K, MAX_TOP_K } from '../ai/retrieval/retrievalService.js';
import { ask } from '../ai/qa/askService.js';
import logger from '../infra/logger.js';
import type { RagDocumentType } from '../ai/ingest/types.js';

// ---------------------------------------------------------------------------
// POST /api/ai/ingest
// ---------------------------------------------------------------------------

interface IngestBody {
  title?: string;
  filename?: string;
  content?: string;
  mimeType?: string;
  docType?: string;
}

export async function ingestHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  const { title, filename, content, mimeType = 'text/plain', docType = 'OTHER' } = req.body as IngestBody;

  if (!title) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'title is required.' } });
    return;
  }
  if (!content) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'content is required.' } });
    return;
  }

  try {
    const result = await ingestDocument({
      content,
      meta: {
        orgId: userId, // orgId defaults to userId for single-tenant; replace with org lookup when multi-tenancy lands
        userId,
        title,
        filename: filename ?? title,
        mimeType,
        docType: docType as RagDocumentType,
      },
    });

    logger.info({ reqId: req.requestId, documentId: result.documentId }, '[RAG] Ingest request complete');
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/retrieve
// ---------------------------------------------------------------------------

interface RetrieveBody {
  question?: string;
  documentId?: string;
  docType?: string;
  topK?: number;
}

export async function retrieveHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  const { question, documentId, docType, topK } = req.body as RetrieveBody;

  if (!question) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'question is required.' } });
    return;
  }

  if (topK !== undefined && (!Number.isFinite(topK) || topK < MIN_TOP_K || topK > MAX_TOP_K)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `topK must be a number between ${MIN_TOP_K} and ${MAX_TOP_K}.`,
      },
    });
    return;
  }

  try {
    const result = await retrieve({
      orgId: userId,
      question,
      documentId,
      docType: docType as RagDocumentType | undefined,
      topK: clampTopK(topK),
    });

    logger.info({ reqId: req.requestId, chunks: result.chunks.length }, '[RAG] Retrieve request complete');
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /api/ai/ask
// ---------------------------------------------------------------------------

interface AskBody {
  question?: string;
  documentId?: string;
  docType?: string;
  topK?: number;
}

export async function askHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  const { question, documentId, docType, topK } = req.body as AskBody;

  if (!question) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'question is required.' } });
    return;
  }

  if (topK !== undefined && (!Number.isFinite(topK) || topK < MIN_TOP_K || topK > MAX_TOP_K)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `topK must be a number between ${MIN_TOP_K} and ${MAX_TOP_K}.`,
      },
    });
    return;
  }

  try {
    const result = await ask({
      orgId: userId,
      userId,
      question,
      documentId,
      docType: docType as RagDocumentType | undefined,
      topK: clampTopK(topK),
    });

    logger.info(
      { reqId: req.requestId, traceId: result.traceId, confidence: result.confidence },
      '[RAG] Ask request complete',
    );
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
}
