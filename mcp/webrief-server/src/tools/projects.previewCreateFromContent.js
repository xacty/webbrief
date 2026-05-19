import { z } from 'zod';
import { companyId, projectTypeEnum, referenceUrls } from '../schemas/common.js';

export const name = 'projects.previewCreateFromContent';

export const description =
  'Analyzes raw content (paste, URL, or text) and returns a preview of the project that would be created: ' +
  'suggested name, type, and a draft content outline. Use this before projects.createFromPreview to let the ' +
  'user confirm the interpretation.';

export const inputSchema = z.object({
  companyId: companyId.describe('UUID of the company that will own the project'),
  content: z.string().min(1).describe('Raw content to analyze — paste, brief text, URL body, etc.'),
  projectType: projectTypeEnum
    .optional()
    .describe('Override the auto-detected project type'),
  referenceUrls: referenceUrls.describe(
    'Optional list of URLs to pull additional context from (e.g. competitor pages, brand guidelines)'
  ),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
