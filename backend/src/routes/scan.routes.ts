import { Router } from 'express';

/**
 * Scan routes placeholder.
 * TODO: Mount scan controller handlers here when migrating /api/scan endpoint.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', feature: 'scan' });
});

export default router;
