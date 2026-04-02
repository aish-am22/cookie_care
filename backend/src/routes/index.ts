import { Router } from 'express';
import templatesRouter from './templates.routes.js';
import scanRouter from './scan.routes.js';
import emailRouter from './email.routes.js';
import vulnerabilityRouter from './vulnerability.routes.js';
import legalRouter from './legal.routes.js';
import contractsRouter, { generateContract } from './contracts.routes.js';
import chatRouter from './chat.routes.js';
import askRouter from './ask.routes.js';
import aiRouter from './ai.routes.js';
import { findPii, redactDocument } from '../controllers/redaction.controller.js';
import authRoutes from "./auth.routes.js";
import userRouter from './user.routes.js';
import dashboardRouter from './dashboard.routes.js';

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

// Contracts (Phase A core lifecycle + canonical generate):
//   POST /api/contracts/upload       (requires auth)
//   POST /api/contracts/:id/ingest   (requires auth)
//   GET  /api/contracts/:id/status   (requires auth)
//   POST /api/contracts/generate     (requires auth, canonical path)
router.use('/contracts', contractsRouter);

// Legacy path alias: POST /api/generate-contract (no auth, backward compat for existing callers)
router.post('/generate-contract', generateContract);

// Chat with document: POST /api/chat-with-document
router.use('/chat-with-document', chatRouter);

// Ask (RAG Q&A, Phase A stub): POST /api/ask
router.use('/ask', askRouter);

// AI RAG pipeline: POST /api/ai/ingest, /api/ai/retrieve, /api/ai/ask
router.use('/ai', aiRouter);

// User management: profile, password, sessions, scans
router.use('/users', userRouter);

// Dashboard: summary, activity, risk trends, recent scans
router.use('/dashboard', dashboardRouter);

export default router;

