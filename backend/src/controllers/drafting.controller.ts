import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/index.js';
import {
  createDraftingSession,
  getDraftingSession,
  buildWordAddInManifest,
} from '../services/drafting/index.js';
import type { CreateDraftingSessionBody } from '../schemas/drafting.schema.js';

export async function createDraftingSessionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  try {
    const payload = await createDraftingSession(userId, req.body as CreateDraftingSessionBody);
    res.status(201).json({ data: payload });
  } catch (err) {
    next(err);
  }
}

export async function getDraftingSessionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } });
    return;
  }

  try {
    const session = await getDraftingSession(userId, req.params.id);
    if (!session) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Drafting session not found.' } });
      return;
    }

    res.json({ data: session });
  } catch (err) {
    next(err);
  }
}

export function getManifestHandler(req: Request, res: Response): void {
  if (env.NODE_ENV === 'production' && !env.PUBLIC_BASE_URL) {
    res.status(500).json({
      error: {
        code: 'CONFIG_ERROR',
        message: 'PUBLIC_BASE_URL must be configured in production for manifest generation.',
      },
    });
    return;
  }

  const host = req.get('host');
  const protocol = env.NODE_ENV === 'production' ? 'https' : req.protocol;
  const fallbackBaseUrl = host ? `${protocol}://${host}` : 'http://localhost:3001';
  const apiBaseUrl = env.PUBLIC_BASE_URL ?? fallbackBaseUrl;

  const xml = buildWordAddInManifest(apiBaseUrl);
  res.type('application/xml').send(xml);
}
