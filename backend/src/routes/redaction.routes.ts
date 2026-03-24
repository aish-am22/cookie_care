import { Router } from 'express';
import { findPii, redactDocument } from '../controllers/redaction.controller.js';

const router = Router();

router.post('/find-pii', findPii);
router.post('/redact-document', redactDocument);

export default router;
