import { Router } from 'express';
import {
  createDraftingSessionHandler,
  getDraftingSessionHandler,
  getManifestHandler,
} from '../controllers/drafting.controller.js';
import { requireAuth } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import {
  createDraftingSessionBodySchema,
  draftingSessionParamsSchema,
} from '../schemas/drafting.schema.js';

const router = Router();

router.post('/sessions', requireAuth, validate('body', createDraftingSessionBodySchema), createDraftingSessionHandler);
router.get('/sessions/:id', requireAuth, validate('params', draftingSessionParamsSchema), getDraftingSessionHandler);
router.get('/manifest.xml', getManifestHandler);

export default router;
