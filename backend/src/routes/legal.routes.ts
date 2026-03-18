import { Router } from 'express';

/**
 * Legal routes placeholder.
 * TODO: Mount legal controller handlers here when migrating legal review endpoints.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', feature: 'legal' });
});

export default router;
