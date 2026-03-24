import type express from 'express';
import { findPii as findPiiService, redactDocument as redactDocumentService } from '../services/redaction/index.js';

export const findPii = async (req: express.Request, res: express.Response): Promise<void> => {
  const { fileName, fileData, mimeType } = req.body;
  if (!fileName || !fileData || !mimeType) {
    res.status(400).json({ error: 'fileName, fileData, and mimeType are required.' });
    return;
  }

  try {
    const result = await findPiiService({ fileName, fileData, mimeType });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error(`[SERVER] PII finding failed for ${fileName}:`, message);
    res.status(500).json({ error: `Failed to find PII. ${message}` });
  }
};

export const redactDocument = async (req: express.Request, res: express.Response): Promise<void> => {
  const { fileName, fileData, mimeType, redactions } = req.body;
  if (!fileName || !fileData || !mimeType || !redactions) {
    res.status(400).json({ error: 'fileName, fileData, mimeType, and redactions are required.' });
    return;
  }

  try {
    const result = await redactDocumentService({ fileName, fileData, mimeType, redactions });
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error(`[SERVER] Document redaction failed for ${fileName}:`, message);
    res.status(500).json({ error: `Failed to redact document. ${message}` });
  }
};
