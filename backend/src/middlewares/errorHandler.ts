import type express from 'express';
import logger from '../infra/logger.js';
import { isAppError } from '../utils/errors.js';
import { getPrismaErrorCode, isAiCredentialError, isPrismaSchemaError } from '../utils/prismaErrors.js';

// Known application errors that should map to 4xx responses
const AUTH_ERROR_MAP: Record<string, number> = {
  "Email already registered.": 409,
  "Invalid credentials.": 401,
  "Invalid refresh token.": 401,
  "Refresh session expired or invalid.": 401,
  "User not found.": 404,
  "Current password is incorrect.": 400,
  "Invalid or expired reset token.": 400,
  "Email already verified.": 400,
  "Invalid or expired verification token.": 400,
  "Session not found.": 404,
};

export const errorHandler = (
  err: Error,
  req: express.Request,
  res: express.Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: express.NextFunction
): void => {
  const reqId = req.requestId ?? 'unknown';

  // AppError subclasses (NotFoundError, ValidationError, etc.) — use their metadata
  if (isAppError(err)) {
    res.status(err.statusCode).json({
      error: {
        code: err.code ?? 'ERROR',
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  // Known domain errors (auth service messages) mapped to 4xx
  const statusCode = AUTH_ERROR_MAP[err.message];
  if (statusCode) {
    res.status(statusCode).json({ error: { code: 'AUTH_ERROR', message: err.message } });
    return;
  }

  if (isPrismaSchemaError(err)) {
    logger.warn(
      { reqId, path: req.path, method: req.method, prismaCode: getPrismaErrorCode(err) },
      'Database schema mismatch detected. Run prisma migrate deploy.'
    );
    res.status(503).json({
      error: {
        code: 'DATABASE_SCHEMA_NOT_READY',
        message:
          'Database schema is not ready for this endpoint. Run `npx prisma migrate deploy` and restart the backend.',
      },
      requestId: reqId,
    });
    return;
  }

  if (isAiCredentialError(err)) {
    logger.warn({ reqId, path: req.path, method: req.method }, 'AI provider credential error');
    res.status(502).json({
      error: {
        code: 'AI_PROVIDER_AUTH_ERROR',
        message: 'AI provider authentication failed. Check GEMINI_API_KEY/API_KEY configuration.',
      },
      requestId: reqId,
    });
    return;
  }

  logger.error({ err, reqId, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    requestId: reqId,
  });
};
