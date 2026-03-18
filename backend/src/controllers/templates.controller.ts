import type express from 'express';
import { templateService } from '../services/templates/templateService.js';
import { createTemplateSchema, templateIdParamSchema } from '../schemas/templates.schema.js';
import logger from '../infra/logger.js';

export const getTemplates = (req: express.Request, res: express.Response): void => {
  logger.info({ reqId: req.requestId }, 'Fetching all contract templates');
  res.json(templateService.getAll());
};

export const createTemplate = (req: express.Request, res: express.Response): void => {
  const parsed = createTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten().fieldErrors });
    return;
  }
  const template = templateService.create(parsed.data.name, parsed.data.content);
  logger.info({ reqId: req.requestId, templateId: template.id }, 'Created template');
  res.status(201).json(template);
};

export const deleteTemplate = (req: express.Request, res: express.Response): void => {
  const parsed = templateIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid template ID' });
    return;
  }
  const { id } = parsed.data;
  if (!templateService.has(id)) {
    res.status(404).json({ error: `Template with id ${id} not found.` });
    return;
  }
  templateService.delete(id);
  logger.info({ reqId: req.requestId, templateId: id }, 'Deleted template');
  res.status(204).send();
};
