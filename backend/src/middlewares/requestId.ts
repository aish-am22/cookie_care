import { randomUUID } from 'crypto';
import type express from 'express';

export const requestId = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void => {
  const id = (req.headers['x-request-id'] as string) ?? randomUUID();
  req.requestId = id;
  res.setHeader('x-request-id', id);
  next();
};
