import { Router } from 'express';
import { generateContract } from '../controllers/contracts.controller.js';

const router = Router();

router.post('/', generateContract);

export default router;
