import { z } from 'zod';
import { companyId } from '../schemas/common.js';

export const name = 'companies.selectActive';

export const description =
  'Sets the active company for this MCP session. ' +
  'Subsequent tool calls that accept a companyId will default to this value if not explicitly overridden.';

export const inputSchema = z.object({
  companyId: companyId.describe('UUID of the company to activate'),
});

export async function handler(input) {
  return { status: 'not_implemented_yet', tool: name, input };
}
