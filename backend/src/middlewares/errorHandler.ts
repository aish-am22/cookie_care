import type express from 'express';
import logger from '../infra/logger.js';

// Known application errors that should map to 4xx responses
const AUTH_ERROR_MAP: Record<string, number> = {
  "Email already registered.": 409,
  "Invalid credentials.": 401,
  "Invalid refresh token.": 401,
  "Refresh session expired or invalid.": 401,
  "User not found.": 404,
};

export const errorHandler = (
  err: Error,
  req: express.Request,
  res: express.Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: express.NextFunction
): void => {
  const reqId = req.requestId ?? 'unknown';

  // Check if this is a known domain error (auth, validation, etc.)
  const statusCode = AUTH_ERROR_MAP[err.message];
  if (statusCode) {
    res.status(statusCode).json({ error: err.message });
    return;
  }

  logger.error({ err, reqId, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    requestId: reqId,
  });
};
