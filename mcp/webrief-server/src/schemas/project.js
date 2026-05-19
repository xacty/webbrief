import { z } from 'zod';
import { projectId, companyId, pageId, projectTypeEnum } from './common.js';

export const ProjectInput = z.object({
  companyId,
  name: z.string(),
  type: projectTypeEnum.optional(),
});

export const PageSummary = z.object({
  id: pageId,
  name: z.string(),
  position: z.number().int().optional(),
  version: z.number().int(),
  reviewStatus: z.string().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const ProjectOutput = z.object({
  id: projectId,
  companyId,
  name: z.string(),
  projectType: projectTypeEnum,
  clientName: z.string().nullable().optional(),
  clientEmail: z.string().nullable().optional(),
  businessType: z.string().nullable().optional(),
  archivedAt: z.string().datetime().nullable().optional(),
  trashedAt: z.string().datetime().nullable().optional(),
  updatedAt: z.string().datetime().optional(),
});

export const ProjectPreview = z.object({
  previewId: z.string(),
  suggestedName: z.string(),
  suggestedType: projectTypeEnum,
  draftContent: z.string().optional(),
  summary: z.string().optional(),
});
