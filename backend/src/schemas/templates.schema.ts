import { z } from 'zod';

export const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(255),
  content: z.string().min(1, 'Template content is required'),
});

export const templateIdParamSchema = z.object({
  id: z.string().min(1, 'Template ID is required'),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;
