import dotenv from 'dotenv';

// Load env vars BEFORE any other imports
dotenv.config();

import express from 'express';
import cors from 'cors';
import logger from './src/infra/logger.js';
import { requestId } from './src/middlewares/requestId.js';
import { errorHandler } from './src/middlewares/errorHandler.js';
import { rateLimitMiddleware } from './src/middlewares/rateLimit.js';
import apiRouter from './src/routes/index.js';

// Validate required env vars before doing anything else
if (!process.env.API_KEY) {
  logger.fatal('FATAL ERROR: API_KEY environment variable is not set.');
  (process as any).exit(1);
}

const app = express();
const port = 3001;

app.use(cors({ origin: true, credentials: true }));
// Increase request body limit to 50mb to handle large base64 PDF payloads
app.use(express.json({ limit: '50mb' }));
app.use(requestId);
app.use(rateLimitMiddleware);

app.use('/api', apiRouter);

app.use(errorHandler);

app.listen(port, () => {
  logger.info(`Backend server running at http://localhost:${port}`);
});