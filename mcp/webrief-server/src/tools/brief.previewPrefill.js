import { z } from 'zod';
import { projectId } from '../schemas/common.js';

export const name = 'brief.previewPrefill';

export const description =
  'Analyzes raw content against an existing project brief and returns a preview of how the brief ' +
  'questions would be auto-filled. Does not persist anything — use this to show the user what ' +
  'would change before committing.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project whose brief should be prefilled'),
  content: z.string().min(1).describe('Raw content to map onto brief questions'),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
