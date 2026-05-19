import { z } from 'zod';
import { pageId, projectId } from './common.js';

export const PageInput = z.object({
  projectId,
  name: z.string(),
  content: z.string().optional(),
});

export const PageOutput = z.object({
  id: pageId,
  projectId,
  name: z.string(),
  contentJson: z.unknown().optional(),
  contentHtml: z.string().optional(),
  version: z.number().int(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const PageDraftPreview = z.object({
  name: z.string().optional(),
  contentJson: z.unknown().optional(),
  contentHtml: z.string().optional(),
  summary: z.string().optional(),
});

export const EditPreview = z.object({
  contentJson: z.unknown().optional(),
  diffSummary: z.string().optional(),
  changedSections: z.array(z.string()).optional(),
});
