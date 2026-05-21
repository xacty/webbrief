import { z } from 'zod';
import { companyId, previewId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { post } from '../lib/webbriefClient.js';
import { getPreview, deletePreview } from '../lib/previewStore.js';

export const name = 'projects.createFromPreview';

export const description =
  'Creates a WeBrief project from a previously generated preview. ' +
  'Returns the new projectId. Must be called after projects.previewCreateFromContent ' +
  'with the previewId it returned. The preview expires after ~10 minutes.';

export const inputSchema = z.object({
  companyId: companyId.describe('UUID of the company that will own the project'),
  previewId: previewId.describe('Opaque preview token returned by projects.previewCreateFromContent'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  const entry = getPreview(input.previewId);
  if (!entry) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'preview_not_found',
        message:
          `Preview ${input.previewId} was not found. ` +
          'It may have expired or already been applied. ' +
          'Call projects.previewCreateFromContent again to obtain a fresh previewId.',
      },
    };
  }

  if (entry.kind !== 'create_project') {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'preview_kind_mismatch',
        message:
          `Preview ${input.previewId} is of kind '${entry.kind}', not 'create_project'. ` +
          'Use the matching apply tool for that kind.',
      },
    };
  }

  const data = entry.data;
  if (data.companyId !== input.companyId) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'preview_company_mismatch',
        message:
          'The companyId argument does not match the company stored in the preview. ' +
          'Re-run projects.previewCreateFromContent with the desired company.',
      },
    };
  }

  try {
    const payload = {
      companyId: data.companyId,
      name: data.name,
      projectType: data.projectType,
      businessType: data.businessType,
    };
    if (data.clientName) payload.clientName = data.clientName;
    if (data.clientEmail) payload.clientEmail = data.clientEmail;

    const response = await post('/projects', payload);
    const project = response?.project ?? response;

    // Burn the preview so it can't be applied twice.
    deletePreview(input.previewId);

    return {
      status: 'ok',
      tool: name,
      projectId: project.id,
      project: {
        id: project.id,
        name: project.name,
        companyId: project.company_id ?? project.companyId ?? data.companyId,
        projectType: project.project_type ?? project.projectType ?? data.projectType,
        businessType: project.business_type ?? project.businessType ?? data.businessType,
        clientName: project.client_name ?? project.clientName ?? null,
        clientEmail: project.client_email ?? project.clientEmail ?? null,
        createdAt: project.created_at ?? project.createdAt ?? null,
        updatedAt: project.updated_at ?? project.updatedAt ?? null,
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
            'The MCP token was rejected by the backend, or your role cannot create projects in this company.',
          backendStatus: error.status,
        },
      };
    }
    if (error.status === 400) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'invalid_preview_data',
          message: error.message ?? 'Backend rejected the project payload built from the preview.',
          backendStatus: 400,
        },
      };
    }
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_error',
        message: error.message ?? 'Unexpected error creating project from preview.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
