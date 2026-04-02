import type express from 'express';
import {
  generateContract as generateContractService,
  uploadContractDocument,
  ingestContractDocument,
  getContractDocumentStatus,
} from '../services/contracts/index.js';
import logger from '../infra/logger.js';

interface GenerateContractBody {
  contractType: string;
  details: string;
  templateContent?: string;
}

export const generateContract = async (req: express.Request, res: express.Response): Promise<void> => {
  const { contractType, details, templateContent } = req.body as GenerateContractBody;
  if (!contractType || !details) {
    res.status(400).json({ error: 'Contract type and details are required.' });
    return;
  }

  try {
    const contract = await generateContractService(contractType, details, templateContent);
    res.json(contract);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error('[SERVER] Contract generation failed:', message);
    res.status(500).json({ error: `Failed to generate contract. ${message}` });
  }
};

// ---------------------------------------------------------------------------
// Phase A – core contract lifecycle endpoints
// ---------------------------------------------------------------------------

/** POST /api/contracts/upload */
export const uploadContract = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  const { filename, mimeType, content } = req.body as {
    filename?: string;
    mimeType?: string;
    content?: string;
  };

  if (!filename) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'filename is required.' } });
    return;
  }

  try {
    const doc = await uploadContractDocument({ userId, filename, mimeType, content });
    logger.info({ reqId: req.requestId, contractId: doc.id }, 'Contract uploaded');
    res.status(201).json({ data: doc });
  } catch (err) {
    next(err);
  }
};

/** POST /api/contracts/:id/ingest */
export const ingestContract = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  const { id } = req.params;
  try {
    const doc = await ingestContractDocument(id, userId);
    logger.info({ reqId: req.requestId, contractId: id, status: doc.status }, 'Contract ingested');
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
};

/** GET /api/contracts/:id/status */
export const getContractStatus = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  const { id } = req.params;
  try {
    const doc = await getContractDocumentStatus(id, userId);
    res.json({ data: doc });
  } catch (err) {
    next(err);
  }
};
