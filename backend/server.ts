import dotenv from 'dotenv';

// Load env vars BEFORE any other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import logger from './src/infra/logger.js';
import { env } from './src/config/index.js';
import { requestId } from './src/middlewares/requestId.js';
import { errorHandler } from './src/middlewares/errorHandler.js';
import { rateLimitMiddleware } from './src/middlewares/rateLimit.js';
import { corsOptions } from './src/middlewares/cors.js';
import apiRouter from './src/routes/index.js';

// Validate required env vars before doing anything else
if (!process.env.API_KEY) {
  logger.fatal('FATAL ERROR: API_KEY environment variable is not set.');
  (process as any).exit(1);
}

const app = express();
const port = 3001;

function parseTrustProxy(value: string): boolean | number | string {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  const asNumber = Number(normalized);
  if (Number.isInteger(asNumber) && asNumber >= 0) return asNumber;
  return value;
}

app.set('trust proxy', parseTrustProxy(env.TRUST_PROXY));

app.use(cors({ ...corsOptions, credentials: true }));
// Increase request body limit to 50mb to handle large base64 PDF payloads
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(requestId);
app.use(rateLimitMiddleware);

app.use('/api', apiRouter);

app.use(errorHandler);

app.listen(port, () => {
  logger.info(`Backend server running at http://localhost:${port}`);
});