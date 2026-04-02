import { Router } from 'express';
import {
  generateContract,
  uploadContract,
  ingestContract,
  getContractStatus,
} from '../controllers/contracts.controller.js';
import { requireAuth } from '../middlewares/auth.js';

const router = Router();

// Core Phase A contract lifecycle (all require auth)
// POST   /api/contracts/upload
// POST   /api/contracts/:id/ingest
// GET    /api/contracts/:id/status
router.post('/upload', requireAuth, uploadContract);
router.post('/:id/ingest', requireAuth, ingestContract);
router.get('/:id/status', requireAuth, getContractStatus);

// POST /api/contracts/generate (canonical path, requires auth)
// Legacy callers still use POST /api/generate-contract (no auth, mounted in routes/index.ts)
router.post('/generate', requireAuth, generateContract);

export default router;
export { generateContract };
