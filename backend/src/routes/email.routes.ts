import { Router } from 'express';

/**
 * Email routes placeholder.
 * TODO: Mount email controller handlers here when migrating /api/email-report endpoint.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', feature: 'email' });
});

export default router;
