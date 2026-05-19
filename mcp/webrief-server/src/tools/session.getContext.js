import { z } from 'zod';

export const name = 'session.getContext';

export const description =
  'Returns the authenticated user context: user profile, default company, and list of accessible companies. ' +
  'Call this first to discover companyId values for subsequent tool calls.';

export const inputSchema = z.object({});

export async function handler(_input) {
  return { status: 'not_implemented_yet', tool: name, input: _input };
}
