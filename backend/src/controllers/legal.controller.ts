import type express from 'express';
import { type LegalPerspective } from '../../types.js';
import { analyzeLegalDocument as analyzeLegalDocumentService } from '../services/legal/index.js';

export const reviewLegal = async (req: express.Request, res: express.Response): Promise<void> => {
  const { documentText, perspective } = req.body as { documentText: string; perspective: LegalPerspective };
  if (!documentText) {
    res.status(400).json({ error: 'Document text is required.' });
    return;
  }

  try {
    console.log(`[SERVER] Received legal analysis request (perspective: ${perspective}).`);
    const analysis = await analyzeLegalDocumentService(documentText, perspective);
    res.json(analysis);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error('[SERVER] Legal analysis failed:', message);
    res.status(500).json({ error: `Failed to analyze document. ${message}` });
  }
};
