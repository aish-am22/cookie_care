import type { CorsOptions } from 'cors';

const officeDomainPatterns = [
  /^https:\/\/.*\.office\.com$/i,
  /^https:\/\/.*\.office365\.com$/i,
  /^https:\/\/.*\.officeapps\.live\.com$/i,
  /^https:\/\/.*\.microsoft\.com$/i,
];

function isOfficeOrigin(origin: string): boolean {
  return officeDomainPatterns.some((pattern) => pattern.test(origin));
}

const configuredOrigins = (process.env['ALLOWED_ORIGINS'] ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

/**
 * Central CORS options used by the Express app.
 * Import this in server.ts and pass to `cors({ ...corsOptions, credentials: true })`.
 *
 * This keeps cors configuration in one place so future changes
 * (allowed origins, credentials, etc.) are a single-file edit.
 */
export const corsOptions: CorsOptions = {
  // Allow all origins in development and Office domains in all environments.
  origin: (origin, callback) => {
    if (!origin || process.env['NODE_ENV'] !== 'production') {
      callback(null, true);
      return;
    }

    if (configuredOrigins.includes(origin) || isOfficeOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS origin denied: ${origin}`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id'],
};
