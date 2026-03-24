import { Router } from 'express';
import { reviewLegal } from '../controllers/legal.controller.js';

const router = Router();

router.post('/', reviewLegal);

export default router;
