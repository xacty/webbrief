import { z } from 'zod';
import {
  companyId,
  previewId,
  projectTypeEnum,
  businessType,
} from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { post } from '../lib/webbriefClient.js';
import { getPreview, deletePreview } from '../lib/previewStore.js';

export const name = 'projects.createFromPreview';

export const description =
  'Creates a WeBrief project from a previously generated preview. ' +
  'Returns the new projectId. Must be called after projects.previewCreateFromContent ' +
  'with the previewId it returned. The preview expires after ~10 minutes. ' +
  'Accepts optional `overrides` to last-mile-edit the preview before commit ' +
  '(name, projectType, businessType, clientName, clientEmail) so the client ' +
  'does not have to re-run previewCreateFromContent just to tweak a value.';

export const inputSchema = z.object({
  companyId: companyId.describe('UUID of the company that will own the project'),
  previewId: previewId.describe('Opaque preview token returned by projects.previewCreateFromContent'),
  overrides: z
    .object({
      name: z.string().min(1).max(200).optional(),
      projectType: projectTypeEnum.optional(),
      businessType: businessType.optional(),
      clientName: z.string().min(1).max(200).optional(),
      clientEmail: z.string().email().optional(),
    })
    .optional()
    .describe(
      'Last-mile overrides applied on top of the stored preview. Any field set here ' +
        'wins over what the preview captured. Omit to use the preview as-is.',
    ),
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

  const overrides = input.overrides ?? {};
  const resolved = {
    companyId: data.companyId,
    name: overrides.name ?? data.name,
    projectType: overrides.projectType ?? data.projectType,
    businessType: overrides.businessType ?? data.businessType,
    clientName: overrides.clientName ?? data.clientName ?? null,
    clientEmail: overrides.clientEmail ?? data.clientEmail ?? null,
  };

  try {
    const payload = {
      companyId: resolved.companyId,
      name: resolved.name,
      projectType: resolved.projectType,
      businessType: resolved.businessType,
    };
    if (resolved.clientName) payload.clientName = resolved.clientName;
    if (resolved.clientEmail) payload.clientEmail = resolved.clientEmail;

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
        companyId: project.company_id ?? project.companyId ?? resolved.companyId,
        projectType: project.project_type ?? project.projectType ?? resolved.projectType,
        businessType: project.business_type ?? project.businessType ?? resolved.businessType,
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
