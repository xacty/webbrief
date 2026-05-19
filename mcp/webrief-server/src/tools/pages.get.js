import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';

export const name = 'pages.get';

export const description =
  'Fetches a single page by ID, returning its full content (contentJson, contentHtml) and current version. ' +
  'Record the version — you will need it to call pages.applyEdits without triggering a version conflict.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the page belongs to'),
  pageId: pageId.describe('UUID of the page to fetch'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  try {
    // No standalone page endpoint exists — fetch the project which returns all pages with full content
    const data = await get(`/projects/${input.projectId}`);
    const { pages } = data;

    const page = (pages ?? []).find((p) => p.id === input.pageId);

    if (!page) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'page_not_found',
          message: `Page ${input.pageId} was not found in project ${input.projectId}.`,
        },
      };
    }

    return {
      status: 'ok',
      tool: name,
      page: {
        id: page.id,
        projectId: input.projectId,
        name: page.name,
        position: page.position,
        contentHtml: page.contentHtml ?? null,
        contentJson: page.contentJson ?? null,
        seoMetadata: page.seoMetadata ?? {},
        version: page.version ?? 1,
        reviewStatus: page.reviewStatus ?? 'draft',
        updatedAt: page.updatedAt ?? null,
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
        message: error.message ?? 'Unexpected error fetching page.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
