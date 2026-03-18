import { Router } from 'express';
import templatesRouter from './templates.routes.js';

const router = Router();

router.use('/templates', templatesRouter);

export default router;
