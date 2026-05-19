import { z } from 'zod';
import { companyId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { setActiveCompanyId, getActiveCompanyId } from '../session/activeCompany.js';

export const name = 'companies.selectActive';

export const description =
  'Sets the active company for this MCP session. ' +
  'Subsequent tool calls that accept a companyId will default to this value if not explicitly overridden. ' +
  'Validates that the given companyId is one the current user can access before activating it.';

export const inputSchema = z.object({
  companyId: companyId.describe('UUID of the company to activate'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  try {
    // Validate that this company is accessible to the current user
    const { companies } = await get('/companies');
    const match = (companies ?? []).find((c) => c.id === input.companyId);

    if (!match) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'company_not_found',
          message: `Company ${input.companyId} was not found or you do not have access to it.`,
        },
      };
    }

    setActiveCompanyId(input.companyId);

    return {
      status: 'ok',
      tool: name,
      activeCompanyId: getActiveCompanyId(),
      company: {
        id: match.id,
        name: match.name,
        slug: match.slug ?? null,
        membershipRole: match.membershipRole ?? null,
      },
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
        message: error.message ?? 'Unexpected error selecting active company.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
