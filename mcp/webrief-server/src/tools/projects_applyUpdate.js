import { z } from 'zod';
import { projectId, previewId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { patch } from '../lib/webbriefClient.js';
import { getPreview, deletePreview } from '../lib/previewStore.js';

export const name = 'projects_applyUpdate';

export const description =
  'What: commits a project meta update preview via PATCH /projects/:id. Returns the updated project. Only the diffed fields (computed in previewUpdate) are sent — untouched columns are not overwritten. ' +
  'When: step 2 of the project-update flow, AFTER projects.previewUpdate. The preview expires ~10 min after creation. ' +
  'Side effects: writes the project meta. Burns the preview so it cannot be applied twice. ' +
  'Errors: mcp_token_missing, backend_unauthorized, preview_not_found, preview_kind_mismatch, preview_project_mismatch, empty_update, invalid_update, project_not_found, backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project to update'),
  previewId: previewId.describe('Opaque preview token from projects.previewUpdate'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  const entry = getPreview(input.previewId);
  if (!entry) {
    return errOf(
      'preview_not_found',
      `Preview ${input.previewId} was not found. It may have expired or already been applied.`,
    );
  }
  if (entry.kind !== 'update_project') {
    return errOf(
      'preview_kind_mismatch',
      `Preview ${input.previewId} is of kind '${entry.kind}', not 'update_project'.`,
    );
  }
  if (entry.data.projectId !== input.projectId) {
    return errOf(
      'preview_project_mismatch',
      'The projectId argument does not match the project stored in the preview.',
    );
  }

  const { changes } = entry.data;
  if (!changes || Object.keys(changes).length === 0) {
    return errOf('empty_update', 'The stored preview has no effective changes.');
  }

  try {
    const response = await patch(`/projects/${input.projectId}`, changes);
    deletePreview(input.previewId);

    const project = response?.project ?? response;
    return {
      status: 'ok',
      tool: name,
      project: {
        id: project.id,
        name: project.name,
        clientName: project.clientName ?? null,
        clientEmail: project.clientEmail ?? null,
        businessType: project.businessType ?? null,
        projectType: project.projectType,
        companyId: project.companyId,
        updatedAt: project.updatedAt ?? null,
      },
      applied: changes,
    };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return errOf(
        'backend_unauthorized',
        'The MCP token was rejected, or your role cannot edit this project.',
        { backendStatus: error.status },
      );
    }
    if (error.status === 400) {
      return errOf(
        'invalid_update',
        error.message ?? 'Backend rejected the project update payload.',
        { backendStatus: 400 },
      );
    }
    if (error.status === 404) {
      return errOf(
        'project_not_found',
        `Project ${input.projectId} was not found.`,
        { backendStatus: 404 },
      );
    }
    return errOf('backend_error', error.message ?? 'Unexpected error applying project update.', {
      backendStatus: error.status ?? null,
    });
  }

  function errOf(code, message, extras = {}) {
    return { status: 'error', tool: name, error: { code, message, ...extras } };
  }
}
