import { describe, expect, it, vi, beforeEach } from 'vitest';
import type express from 'express';
import { errorHandler } from '../errorHandler.js';

const loggerMock = vi.hoisted(() => ({
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../../infra/logger.js', () => ({ default: loggerMock }));

function createRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as express.Response & { statusCode: number; body: unknown };
}

function createReq(): express.Request {
  return {
    requestId: 'req-1',
    path: '/api/dashboard/summary',
    method: 'GET',
  } as express.Request;
}

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps Prisma schema mismatch errors to 503', () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    const prismaErr = {
      name: 'PrismaClientKnownRequestError',
      code: 'P2021',
      message: 'The table public.ScanRecord does not exist',
    } as unknown as Error;

    errorHandler(prismaErr, req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.body).toEqual({
      error: {
        code: 'DATABASE_SCHEMA_NOT_READY',
        message:
          'Database schema is not ready for this endpoint. Run `npx prisma migrate deploy` and restart the backend.',
      },
      requestId: 'req-1',
    });
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });

  it('maps AI credential errors to 502', () => {
    const req = createReq();
    const res = createRes();
    const next = vi.fn();
    const aiErr = new Error('API key not valid. Please pass a valid API key.');

    errorHandler(aiErr, req, res, next);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({
      error: {
        code: 'AI_PROVIDER_AUTH_ERROR',
        message: 'AI provider authentication failed. Check GEMINI_API_KEY/API_KEY configuration.',
      },
      requestId: 'req-1',
    });
    expect(loggerMock.warn).toHaveBeenCalledOnce();
    expect(loggerMock.error).not.toHaveBeenCalled();
  });
});
