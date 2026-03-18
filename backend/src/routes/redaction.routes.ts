import { Router } from 'express';

/**
 * Redaction routes placeholder.
 * TODO: Mount redaction controller handlers here when migrating
 * the /api/find-pii and /api/redact-document endpoints.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', feature: 'redaction' });
});

export default router;
