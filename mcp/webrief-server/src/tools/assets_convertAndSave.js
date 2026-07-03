import { z } from 'zod';
import { projectId } from '../schemas/common.js';
import { exportOptionsShape } from '../schemas/asset.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { post } from '../lib/webbriefClient.js';

export const name = 'assets_convertAndSave';

export const description =
  'What: converts an existing raster asset (format/quality/resize/crop) and SAVES the result back into the project as a NEW asset. Returns { asset } with the new id/fileName/publicUrl/fileSize/width/height. The original asset is never modified. ' +
  'When: the user wants a converted/compressed/cropped copy stored in the project (e.g. "guarda una versión WebP comprimida de esta imagen"). For download-only exports use assets_export instead. ' +
  'Requires at least one transformation (format, quality, width, height or cropMode). SVG sources are refused. Converted output is capped at 8 MB. ' +
  'Side effects: uploads a new file to storage, inserts a project_assets row, and logs asset activity. ' +
  'Errors: mcp_token_missing, backend_unauthorized, export_forbidden, project_not_found, asset_not_found, invalid_request, backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the asset belongs to'),
  assetId: z.string().uuid().optional().describe('project_assets UUID (from assets_list)'),
  src: z.string().url().optional().describe('Image URL as it appears in page contentHtml'),
  ...exportOptionsShape,
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  if (!input.assetId && !input.src) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'invalid_request',
        message: 'Provide assetId or src to identify the source asset.',
      },
    };
  }

  const { projectId: id, ...body } = input;

  try {
    const { asset } = await post(`/projects/${id}/assets/convert`, body);

    return {
      status: 'ok',
      tool: name,
      asset: {
        id: asset.id,
        projectId: asset.projectId,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        assetKind: asset.assetKind,
        publicUrl: asset.publicUrl ?? asset.originalUrl ?? null,
        fileSize: asset.fileSize ?? null,
        width: asset.width ?? null,
        height: asset.height ?? null,
        convertedFromAssetId: asset.convertedFromAssetId ?? null,
        createdAt: asset.createdAt ?? null,
      },
    };
  } catch (error) {
    if (error.status === 403) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'export_forbidden',
          message: 'Your role cannot save converted images into this project.',
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
            : 'The source asset was not found in this project. Check the ID with assets_list.',
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
          message: error.body?.error ?? 'The conversion request was rejected by the backend.',
          backendStatus: 400,
        },
      };
    }

    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_error',
        message: error.message ?? 'Unexpected error converting the asset.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
