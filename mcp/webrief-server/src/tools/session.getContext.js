import { z } from 'zod';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { getActiveCompanyId } from '../session/activeCompany.js';

export const name = 'session.getContext';

export const description =
  'Returns the authenticated user context: user profile, default company, and list of accessible companies. ' +
  'Also reports the currently active company for this MCP session (if one has been set). ' +
  'Call this first to discover companyId values for subsequent tool calls.';

export const inputSchema = z.object({});

export async function handler(_input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  try {
    // Fetch user profile and company list in parallel
    const [meResult, companiesResult] = await Promise.all([
      get('/auth/me'),
      get('/companies'),
    ]);

    const activeCompanyId = getActiveCompanyId();

    return {
      status: 'ok',
      tool: name,
      user: meResult.user,
      companies: companiesResult.companies,
      activeCompanyId: activeCompanyId ?? null,
    };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'backend_unauthorized',
          message:
            'The MCP token was rejected by the backend. ' +
            'Make sure the token is valid and has not been revoked.',
          backendStatus: error.status,
        },
      };
    }

    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_error',
        message: error.message ?? 'Unexpected error fetching session context.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
