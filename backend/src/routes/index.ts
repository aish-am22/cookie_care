import { Router } from 'express';
import templatesRouter from './templates.routes.js';
import scanRouter from './scan.routes.js';
import emailRouter from './email.routes.js';
import vulnerabilityRouter from './vulnerability.routes.js';
import legalRouter from './legal.routes.js';
import contractsRouter from './contracts.routes.js';
import chatRouter from './chat.routes.js';
import { findPii, redactDocument } from '../controllers/redaction.controller.js';
import authRoutes from "./auth.routes.js";

const router = Router();
router.use('/auth', authRoutes);
// Templates: GET/POST /api/templates, DELETE /api/templates/:id
router.use('/templates', templatesRouter);

// Scan: GET /api/scan
router.use('/scan', scanRouter);

// Email report: POST /api/email-report
router.use('/email-report', emailRouter);

// Vulnerability scan: POST /api/scan-vulnerabilities
router.use('/scan-vulnerabilities', vulnerabilityRouter);

// Redaction: POST /api/find-pii and POST /api/redact-document
// These two endpoints share the redaction controller but have distinct paths.
router.post('/find-pii', findPii);
router.post('/redact-document', redactDocument);

// Legal analysis: POST /api/analyze-legal-document
router.use('/analyze-legal-document', legalRouter);

// Contract generation: POST /api/generate-contract
router.use('/generate-contract', contractsRouter);

// Chat with document: POST /api/chat-with-document
router.use('/chat-with-document', chatRouter);

export default router;
