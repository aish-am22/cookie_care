import type express from 'express';
import { chatWithDocument as chatWithDocumentService } from '../services/chat/index.js';

export const chat = async (req: express.Request, res: express.Response): Promise<void> => {
  const { documentText, question } = req.body;
  if (!documentText || !question) {
    res.status(400).json({ error: 'Document text and a question are required.' });
    return;
  }

  try {
    console.log('[AI] Answering/editing question about document...');
    const response = await chatWithDocumentService(documentText, question);
    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred.';
    console.error('[SERVER] Chat with document failed:', message);
    res.status(500).json({ error: `Chat failed. ${message}` });
  }
};
