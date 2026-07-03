import { z } from 'zod';
import { projectId } from '../schemas/common.js';
import { exportOptionsShape, exportItem } from '../schemas/asset.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { post } from '../lib/webbriefClient.js';

export const name = 'assets_export';

export const description =
  'What: exports one or MANY project images with optional transformations (format conversion, compression quality, resize, crop) and returns { links[] } — one ready-to-download URL + fileName per image. No binaries flow through MCP; share the URLs with the user or fetch them yourself. ' +
  'When: the user wants to download/export project images, convert format (e.g. PNG→WebP), compress, resize, or crop — including batch exports ("export all images as WebP"). Discover asset IDs first with assets_list. ' +
  'Side effects: none (read-only; nothing is saved to the project — use assets_convertAndSave for that). SVG assets are returned as-is (no raster transforms). ' +
  'Errors: mcp_token_missing, backend_unauthorized, export_forbidden, project_not_found, asset_not_found, invalid_request, backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the assets belong to'),
  items: z
    .array(exportItem)
    .min(1)
    .max(100)
    .describe('Assets to export (1-100). Each item: { assetId } (preferred) or { src }.'),
  ...exportOptionsShape,
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  const { projectId: id, items, ...options } = input;

  try {
    const data = await post(`/projects/${id}/assets/export-links`, {
      items,
      ...options,
    });

    return {
      status: 'ok',
      tool: name,
      requested: data.requested ?? items.length,
      resolved: data.resolved ?? (data.links ?? []).length,
      options: data.options ?? null,
      links: (data.links ?? []).map((link) => ({
        assetId: link.assetId,
        fileName: link.fileName,
        url: link.url,
        mimeType: link.mimeType ?? null,
        assetKind: link.assetKind ?? null,
        transformed: Boolean(link.transformed),
      })),
    };
  } catch (error) {
    if (error.status === 403) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'export_forbidden',
          message: 'Your role cannot export images from this project.',
          backendStatus: 403,
        },
      };
    }

    if (error.status === 401) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'backend_unauthorized',
          message:
            'The MCP token was rejected by the backend. ' +
            'Make sure the token is valid and has not been revoked.',
          backendStatus: 401,
        },
      };
    }

    if (error.status === 404) {
      const backendMessage = String(error.body?.error ?? '');
      const isProjectMissing = backendMessage.toLowerCase().includes('proyecto');
      return {
        status: 'error',
        tool: name,
        error: {
          code: isProjectMissing ? 'project_not_found' : 'asset_not_found',
          message: isProjectMissing
            ? `Project ${id} was not found or you do not have access to it.`
            : 'None of the requested assets were found in this project. Check the IDs with assets_list.',
          backendStatus: 404,
        },
      };
    }

    if (error.status === 400) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'invalid_request',
          message: error.body?.error ?? 'The export request was rejected by the backend.',
          backendStatus: 400,
        },
      };
    }

    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_error',
        message: error.message ?? 'Unexpected error exporting assets.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
