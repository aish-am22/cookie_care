import { Router } from 'express';
import { ask } from '../controllers/ask.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// POST /api/ask
router.post('/', requireAuth, ask);

export default router;
