import { GoogleGenAI, Type } from '@google/genai';
import { env } from '../../config/env.js';
import logger from '../../infra/logger.js';

export { Type };

const aiApiKey = env.GEMINI_API_KEY ?? env.API_KEY;
export const ai = new GoogleGenAI({ apiKey: aiApiKey });
export const model = 'gemini-2.5-flash';

/**
 * Serializes AI call to stay within rate limits (e.g. 10 RPM on free tier).
 * Processes tasks one at a time with a minimum interval between them.
 */
export class AiCallQueue {
  private queue: { task: () => Promise<any>; resolve: (value: any) => void; reject: (reason?: any) => void }[] = [];
  private isProcessing = false;
  // Free tier limit is 10 RPM. 60s / 10 = 6s per request. Add a 100ms buffer.
  private readonly minInterval: number = 6100;

  add<T>(task: () => Promise<T>): Promise<T> {
    logger.debug({ queueSize: this.queue.length + 1 }, '[AI_QUEUE] Task added');
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  private async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      logger.debug('[AI_QUEUE] Queue empty');
      return;
    }

    this.isProcessing = true;
    const { task, resolve, reject } = this.queue.shift()!;
    logger.debug({ remaining: this.queue.length }, '[AI_QUEUE] Processing task');

    try {
      const result = await task();
      resolve(result);
    } catch (err) {
      logger.warn({ err }, '[AI_QUEUE] Task failed');
      reject(err);
    } finally {
      setTimeout(() => this.processQueue(), this.minInterval);
    }
  }
}

export const aiCallQueue = new AiCallQueue();
