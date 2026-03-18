import type express from 'express';
import logger from '../infra/logger.js';

export const errorHandler = (
  err: Error,
  req: express.Request,
  res: express.Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: express.NextFunction
): void => {
  const reqId = req.requestId ?? 'unknown';
  logger.error({ err, reqId, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    requestId: reqId,
  });
};
