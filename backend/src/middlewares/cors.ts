import type { CorsOptions } from 'cors';

/**
 * Central CORS options used by the Express app.
 * Import this in server.ts and pass to `cors(corsOptions)`.
 *
 * This keeps cors configuration in one place so future changes
 * (allowed origins, credentials, etc.) are a single-file edit.
 */
export const corsOptions: CorsOptions = {
  // Allow all origins in development; tighten in production via env
  origin: process.env['NODE_ENV'] === 'production'
    ? (process.env['ALLOWED_ORIGINS'] ?? '').split(',').filter(Boolean)
    : '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
};
