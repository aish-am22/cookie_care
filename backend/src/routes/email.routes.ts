import { Router } from 'express';
import { sendEmailReport } from '../controllers/email.controller.js';

const router = Router();

router.post('/', sendEmailReport);

export default router;
