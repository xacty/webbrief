import { z } from 'zod';
import { projectId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';

export const name = 'projects_get';

export const description =
  'What: returns { project, pages[] } for a project. Project meta covers id/name/companyId/projectType/clientName/clientEmail/businessType/archivedAt/trashedAt/updatedAt; pages are summarized (id/name/position/version/reviewStatus/updatedAt) without content. ' +
  'When: use to inspect what a project contains before editing, or to harvest the page list to drive pages.get / pages.applyEdits. ' +
  'Side effects: none (read-only). ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project to fetch'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  try {
    const data = await get(`/projects/${input.projectId}`);

    // Backend returns { project: {...}, pages: [...] }
    const { project, pages } = data;

    return {
      status: 'ok',
      tool: name,
      project: {
        id: project.id,
        name: project.name,
        companyId: project.companyId,
        projectType: project.projectType,
        clientName: project.clientName ?? null,
        clientEmail: project.clientEmail ?? null,
        businessType: project.businessType ?? null,
        archivedAt: project.archivedAt ?? null,
        trashedAt: project.trashedAt ?? null,
        updatedAt: project.updatedAt ?? null,
      },
      pages: (pages ?? []).map((page) => ({
        id: page.id,
        name: page.name,
        position: page.position,
        version: page.version ?? 1,
        reviewStatus: page.reviewStatus ?? 'draft',
        updatedAt: page.updatedAt ?? null,
      })),
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

    if (error.status === 404) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'project_not_found',
          message: `Project ${input.projectId} was not found or you do not have access to it.`,
          backendStatus: 404,
        },
      };
    }

    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_error',
        message: error.message ?? 'Unexpected error fetching project.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
