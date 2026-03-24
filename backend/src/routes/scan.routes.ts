import { Router } from 'express';
import { startScan } from '../controllers/scan.controller.js';

const router = Router();

router.get('/', startScan);

export default router;
