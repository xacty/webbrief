import { z } from 'zod';
import { companyId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { setActiveCompanyId, getActiveCompanyId } from '../session/activeCompany.js';

export const name = 'companies.selectActive';

export const description =
  'What: pins a companyId as the active company for the current MCP session and returns the activated company info. ' +
  'When: call after session.getContext when the user has access to more than one company, BEFORE any mutation tool. The active company is a session default — mutation tools still require explicit companyId arguments. ' +
  'Side effects: validates membership against /companies, then mutates module-level session state (process-local, lost when MCP process restarts). ' +
  'Errors: mcp_token_missing, backend_unauthorized, company_not_found, backend_error.';

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
