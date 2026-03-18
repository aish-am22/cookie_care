import { Router } from 'express';
import templatesRouter from './templates.routes.js';

// ---------------------------------------------------------------------------
// Placeholder routers — each is mounted under its own sub-path so that the
// /health sub-route can be exercised in integration tests.  No existing
// endpoints are affected; the real handlers will be added incrementally.
// ---------------------------------------------------------------------------
import scanRouter from './scan.routes.js';
import emailRouter from './email.routes.js';
import vulnerabilityRouter from './vulnerability.routes.js';
import redactionRouter from './redaction.routes.js';
import legalRouter from './legal.routes.js';
import contractsRouter from './contracts.routes.js';
import chatRouter from './chat.routes.js';

const router = Router();

// --- Active routes ----------------------------------------------------------
router.use('/templates', templatesRouter);

// --- Scaffold routes (placeholder — no active handlers yet) -----------------
// TODO: Progressively migrate legacy server.ts endpoints into each router.
router.use('/scan', scanRouter);
router.use('/email', emailRouter);
router.use('/vulnerability', vulnerabilityRouter);
router.use('/redaction', redactionRouter);
router.use('/legal', legalRouter);
router.use('/contracts', contractsRouter);
router.use('/chat', chatRouter);

export default router;
