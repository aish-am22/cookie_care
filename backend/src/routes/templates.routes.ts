import { Router } from 'express';
import { getTemplates, createTemplate, deleteTemplate } from '../controllers/templates.controller.js';

const router = Router();

router.get('/', getTemplates);
router.post('/', createTemplate);
router.delete('/:id', deleteTemplate);

export default router;
