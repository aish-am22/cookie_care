import type express from 'express';
import { askAboutContract } from '../services/contracts/index.js';
import logger from '../infra/logger.js';

interface AskBody {
  contractId?: string;
  question?: string;
}

/** POST /api/ask */
export const ask = async (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): Promise<void> => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  const { contractId, question } = req.body as AskBody;

  if (!contractId) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'contractId is required.' } });
    return;
  }
  if (!question) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'question is required.' } });
    return;
  }

  try {
    const result = await askAboutContract(contractId, userId, question);
    logger.info({ reqId: req.requestId, contractId }, 'Ask completed');
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
};
