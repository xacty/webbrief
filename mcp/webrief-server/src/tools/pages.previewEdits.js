import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';

export const name = 'pages.previewEdits';

export const description =
  'Applies a list of edit operations to a page in memory and returns the resulting contentJson plus a diff summary. ' +
  'Nothing is persisted — use this to confirm edits look right before calling pages.applyEdits.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project'),
  pageId: pageId.describe('UUID of the page to preview edits on'),
  // TODO (N+4): replace z.unknown() with the typed operation schema once
  // the edit operation format is finalized.
  edits: z.array(z.unknown()).describe('List of edit operations to preview (operation schema defined in N+4)'),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
