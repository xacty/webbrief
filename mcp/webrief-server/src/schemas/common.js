import { z } from 'zod';

export const companyId = z.string().uuid();
export const projectId = z.string().uuid();
export const pageId = z.string().uuid();
export const previewId = z.string().min(1);

// Backend `normalizeProjectType` (backend/src/routes/projects.js) only accepts
// these four values; anything else falls back to 'page'. Keep this enum in
// sync with that helper.
export const projectTypeEnum = z.enum(['page', 'brief', 'document', 'faq']);

// Business type templates from backend/src/data/projectTemplates.js. The
// backend defaults to 'tabula_rasa' when missing; we mirror that fallback in
// the create handler rather than the schema, so callers can omit it freely.
export const businessType = z.string().min(1).max(64);

export const referenceUrls = z.array(z.string().url()).max(10).optional();
