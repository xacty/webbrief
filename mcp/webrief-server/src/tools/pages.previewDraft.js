import { z } from 'zod';
import { projectId } from '../schemas/common.js';

export const name = 'pages.previewDraft';

export const description =
  'Generates a draft page from raw content within an existing project. ' +
  'Returns a page draft (name, contentJson, contentHtml) without persisting it. ' +
  'Use pages.applyEdits or a dedicated create endpoint to persist.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the draft page belongs to'),
  content: z.string().min(1).describe('Raw content to turn into a page draft'),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
