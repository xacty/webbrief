import { z } from 'zod';
import { projectId, companyId, projectTypeEnum } from './common.js';

export const ProjectInput = z.object({
  companyId,
  name: z.string(),
  type: projectTypeEnum.optional(),
});

export const PageSummary = z.object({
  id: z.string().uuid(),
  name: z.string(),
  version: z.number().int(),
});

export const ProjectOutput = z.object({
  id: projectId,
  companyId,
  name: z.string(),
  type: projectTypeEnum,
  pages: z.array(PageSummary),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const ProjectPreview = z.object({
  previewId: z.string(),
  suggestedName: z.string(),
  suggestedType: projectTypeEnum,
  draftContent: z.string().optional(),
  summary: z.string().optional(),
});
