import { z } from 'zod';
import { companyId, projectTypeEnum } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { getActiveCompanyId } from '../session/activeCompany.js';

export const name = 'projects_list';

export const description =
  'What: returns { projects[] } — active (non-archived, non-trashed) projects the user can access, each with id/name/companyId/companyName/projectType/clientName/clientEmail/businessType/updatedAt. ' +
  'When: use to DISCOVER project IDs before projects_get / pages_get, instead of asking the human for a UUID. Scope with companyId (falls back to the active company if one was pinned; with neither, lists projects across ALL accessible companies). Optional filters: projectType, search (case-insensitive match on project name / client name). ' +
  'Side effects: none (read-only). ' +
  'Errors: mcp_token_missing, backend_unauthorized, company_not_found, backend_error.';

export const inputSchema = z.object({
  companyId: companyId
    .optional()
    .describe('UUID of the company to list projects for. Omit to use the active company, or to list across all accessible companies if none is pinned.'),
  projectType: projectTypeEnum
    .optional()
    .describe('Filter by project type (page | brief | document | faq).'),
  search: z
    .string()
    .min(1)
    .max(120)
    .optional()
    .describe('Case-insensitive substring match against project name and client name.'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  const effectiveCompanyId = input.companyId ?? getActiveCompanyId() ?? null;

  try {
    const path = effectiveCompanyId
      ? `/projects?companyId=${encodeURIComponent(effectiveCompanyId)}`
      : '/projects';
    const { projects } = await get(path);

    let list = (projects ?? []).map((project) => ({
      id: project.id,
      name: project.name,
      companyId: project.companyId,
      companyName: project.companyName ?? '',
      projectType: project.projectType,
      clientName: project.client ?? null,
      clientEmail: project.clientEmail ?? null,
      businessType: project.businessType ?? null,
      updatedAt: project.lastActivity ?? null,
    }));

    if (input.projectType) {
      list = list.filter((project) => project.projectType === input.projectType);
    }

    if (input.search) {
      const needle = input.search.toLowerCase();
      list = list.filter((project) =>
        (project.name ?? '').toLowerCase().includes(needle)
        || (project.clientName ?? '').toLowerCase().includes(needle)
      );
    }

    return {
      status: 'ok',
      tool: name,
      companyId: effectiveCompanyId,
      total: list.length,
      projects: list,
    };
  } catch (error) {
    if (error.status === 403 && effectiveCompanyId) {
      // Same privacy posture as companies_selectActive: never confirm whether
      // a foreign company exists.
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'company_not_found',
          message: `Company ${effectiveCompanyId} was not found or you do not have access to it.`,
          backendStatus: 403,
        },
      };
    }

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
        message: error.message ?? 'Unexpected error listing projects.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
