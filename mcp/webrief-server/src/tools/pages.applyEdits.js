import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';

export const name = 'pages.applyEdits';

export const description =
  'Applies a list of edit operations to a page and persists the result. ' +
  'Requires expectedVersion to guard against concurrent edits (optimistic concurrency). ' +
  'On version conflict returns { code: "version_conflict", currentVersion, currentSnapshot } ' +
  'so the caller can re-fetch and retry.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project'),
  pageId: pageId.describe('UUID of the page to edit'),
  expectedVersion: z
    .number()
    .int()
    .describe('Version the caller last read — used for optimistic concurrency control'),
  // TODO (N+4): replace z.unknown() with the typed operation schema once
  // the edit operation format is finalized.
  edits: z.array(z.unknown()).describe('List of edit operations to apply (operation schema defined in N+4)'),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
