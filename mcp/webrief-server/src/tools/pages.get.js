import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';

export const name = 'pages.get';

export const description =
  'Fetches a single page by ID, returning its full content (contentJson, contentHtml) and current version. ' +
  'Record the version — you will need it to call pages.applyEdits without triggering a version conflict.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the page belongs to'),
  pageId: pageId.describe('UUID of the page to fetch'),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
