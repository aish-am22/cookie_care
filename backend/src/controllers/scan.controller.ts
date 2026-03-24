import type express from 'express';
import { performScan } from '../services/scan/index.js';

export const startScan = async (req: express.Request, res: express.Response): Promise<void> => {
  const rawUrl = req.query.url as string;
  const depth = (req.query.depth as 'lite' | 'medium' | 'deep' | 'enterprise') || 'lite';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  if (!rawUrl) {
    sendEvent({ type: 'error', message: 'URL is required' });
    res.end();
    return;
  }

  const url = decodeURIComponent(rawUrl);

  try {
    new URL(url);
  } catch (e) {
    console.error(`[SERVER] Scan failed: Invalid URL provided "${url}"`);
    sendEvent({ type: 'error', message: `Failed to scan ${url}. Invalid URL` });
    res.end();
    return;
  }

  console.log(`[SERVER] Received scan request for: ${url}`);

  try {
    await performScan({ url, depth, sendEvent });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error('[SERVER] Scan failed:', message);
    sendEvent({ type: 'error', message: `Failed to scan ${url}. ${message}` });
  } finally {
    res.end();
  }
};
