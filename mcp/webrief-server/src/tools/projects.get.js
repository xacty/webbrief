import { z } from 'zod';
import { projectId } from '../schemas/common.js';

export const name = 'projects.get';

export const description =
  'Fetches a WeBrief project by ID, including its name, type, and a list of its pages (id + name + version). ' +
  'Use pages.get to fetch full page content.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project to fetch'),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
