import { z } from 'zod';

export const createDraftingSessionBodySchema = z.object({
  documentTitle: z.string().min(1).optional(),
  preferredClausesBySection: z.record(z.string(), z.string()).optional(),
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])).optional(),
});

const clauseOptionSchema = z.object({
  clauseId: z.string(),
  title: z.string(),
  version: z.string(),
  status: z.string(),
  sourceDocuments: z.array(z.string()),
  parts: z.array(
    z.object({
      order: z.number().int().positive(),
      heading: z.string().nullable(),
      text: z.string(),
    }),
  ),
  text: z.string(),
});

const skeletonSectionSchema = z.object({
  sectionId: z.string(),
  slotName: z.string(),
  supportedClauseIds: z.array(z.string()),
  selectedClauseId: z.string(),
});

const recommendationSchema = z.object({
  sectionId: z.string(),
  slotName: z.string(),
  recommendedClauseId: z.string(),
  options: z.array(clauseOptionSchema),
});

export const draftingSessionPayloadSchema = z.object({
  sessionId: z.string(),
  title: z.string(),
  skeleton: z.array(skeletonSectionSchema),
  recommendations: z.array(recommendationSchema),
  render: z.object({
    format: z.enum(['html', 'openxml']),
    content: z.string(),
  }),
  createdAt: z.string(),
});

export const draftingSessionParamsSchema = z.object({
  id: z.string().min(1),
});

export type CreateDraftingSessionBody = z.infer<typeof createDraftingSessionBodySchema>;
export type DraftingSessionPayload = z.infer<typeof draftingSessionPayloadSchema>;
