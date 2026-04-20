import type express from 'express';
import { askAboutContract } from '../services/contracts/index.js';
import logger from '../infra/logger.js';
import { clampTopK, MIN_TOP_K, MAX_TOP_K } from '../ai/retrieval/retrievalService.js';

interface AskBody {
  contractId?: string;
  question?: string;
  topK?: number;
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

  const { contractId, question, topK } = req.body as AskBody;

  if (!contractId) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'contractId is required.' } });
    return;
  }
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
    const result = await askAboutContract(contractId, userId, question, clampTopK(topK));
    logger.info({ reqId: req.requestId, contractId }, 'Ask completed');
    res.json({ data: result });
  } catch (err) {
    next(err);
  }
};
