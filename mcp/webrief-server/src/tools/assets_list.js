import { z } from 'zod';
import { projectId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';

export const name = 'assets_list';

export const description =
  'What: returns { assets[] } — every image/SVG uploaded to a project, with id/fileName/mimeType/assetKind/publicUrl/fileSize/width/height/pageId/createdAt. ' +
  'When: call BEFORE assets_export or assets_convertAndSave to discover asset IDs, or to audit what images a project holds. ' +
  'Side effects: none (read-only). ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project whose assets to list'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  try {
    const { assets } = await get(`/projects/${input.projectId}/assets`);

    return {
      status: 'ok',
      tool: name,
      total: (assets ?? []).length,
      assets: (assets ?? []).map((asset) => ({
        id: asset.id,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        assetKind: asset.assetKind,
        publicUrl: asset.publicUrl ?? null,
        fileSize: asset.fileSize ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        pageId: asset.pageId ?? null,
        sectionId: asset.sectionId ?? null,
        createdAt: asset.createdAt ?? null,
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
        message: error.message ?? 'Unexpected error listing assets.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
