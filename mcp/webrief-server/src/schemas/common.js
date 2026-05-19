import { z } from 'zod';

export const companyId = z.string().uuid();
export const projectId = z.string().uuid();
export const pageId = z.string().uuid();
export const previewId = z.string();

export const projectTypeEnum = z.enum([
  'brief',
  'website',
  'landing_page',
  'email',
  'social',
  'ads',
  'other',
]);

export const referenceUrls = z.array(z.string().url()).optional();
