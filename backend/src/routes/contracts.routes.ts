import { Router } from 'express';

/**
 * Contracts routes placeholder.
 * TODO: Mount contracts controller handlers here when migrating contract generation endpoints.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', feature: 'contracts' });
});

export default router;
