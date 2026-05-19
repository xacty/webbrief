import { z } from 'zod';
import { companyId, previewId } from '../schemas/common.js';

export const name = 'projects.createFromPreview';

export const description =
  'Creates a WeBrief project from a previously generated preview. ' +
  'Returns the new projectId. Must be called after projects.previewCreateFromContent.';

export const inputSchema = z.object({
  companyId: companyId.describe('UUID of the company that will own the project'),
  previewId: previewId.describe('Opaque preview token returned by projects.previewCreateFromContent'),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
