import { Router } from 'express';

/**
 * Chat routes placeholder.
 * TODO: Mount chat controller handlers here when migrating the chat/DPA assistant endpoint.
 */
const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', feature: 'chat' });
});

export default router;
