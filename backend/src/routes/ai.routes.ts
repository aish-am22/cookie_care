import { Router } from 'express';
import { ingestHandler, retrieveHandler, askHandler } from '../controllers/ai.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// POST /api/ai/ingest   – ingest a document into the RAG pipeline
router.post('/ingest', requireAuth, ingestHandler);

// POST /api/ai/retrieve – debug retrieval (returns raw ranked chunks)
router.post('/retrieve', requireAuth, retrieveHandler);

// POST /api/ai/ask      – ask a question with citation-grade response
router.post('/ask', requireAuth, askHandler);

export default router;
