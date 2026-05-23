import { z } from 'zod';
import {
  projectId,
  projectTypeEnum,
  businessType,
} from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { savePreview } from '../lib/previewStore.js';

export const name = 'projects.previewUpdate';

export const description =
  'What: dry-runs an update on an EXISTING project meta (any subset of name/clientName/clientEmail/businessType/projectType). Returns previewId + a per-field diff. Fields that already match the current value are dropped from the diff (and `noop:true` is returned if everything matches). ' +
  'When: step 1 of the rename / re-classify flow for a project that already exists. For brand-new projects use projects.previewCreateFromContent instead. ' +
  'Side effects: stores a preview entry in memory (10-min TTL). No DB writes. ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, project_not_mutable (archived/trashed), backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project to update'),
  changes: z
    .object({
      name: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe('New project display name. Cannot be empty.'),
      clientName: z
        .string()
        .max(200)
        .optional()
        .describe('New client/customer name. Send empty string to clear the field.'),
      clientEmail: z
        .string()
        .email()
        .optional()
        .or(z.literal(''))
        .describe('New client email. Send empty string to clear; otherwise must be a valid email.'),
      businessType: businessType
        .optional()
        .describe(
          "Template family (e.g. 'general', 'tabula_rasa'). Cannot be empty when present.",
        ),
      projectType: projectTypeEnum
        .optional()
        .describe('One of: page, brief, document, faq. Unknown values are rejected (no silent coercion).'),
    })
    .strict()
    .refine((c) => Object.keys(c).length > 0, {
      message: 'changes must contain at least one field to update',
    })
    .describe(
      'Partial project meta. Only include fields you want to change. ' +
        'Unknown keys are rejected. At least one field is required.',
    ),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  let data;
  try {
    data = await get(`/projects/${input.projectId}`);
  } catch (error) {
    return mapBackendError(error, input.projectId);
  }

  const project = data?.project;
  if (!project) {
    return errOf('project_not_found', `Project ${input.projectId} was not found.`);
  }
  if (project.archivedAt ?? project.archived_at) {
    return errOf('project_not_mutable', `Project ${input.projectId} is archived.`);
  }
  if (project.trashedAt ?? project.trashed_at) {
    return errOf('project_not_mutable', `Project ${input.projectId} is trashed.`);
  }

  // Build a per-field diff: { field: { before, after } } only when the value
  // actually changes. Fields where the requested value matches the current one
  // are dropped from the diff (and won't be sent to the backend on apply).
  const current = {
    name: project.name,
    clientName: project.clientName ?? null,
    clientEmail: project.clientEmail ?? null,
    businessType: project.businessType ?? null,
    projectType: project.projectType ?? null,
  };

  const diff = {};
  const effectiveChanges = {};
  for (const [field, requested] of Object.entries(input.changes)) {
    const beforeRaw = current[field];
    // Normalize comparison: empty string and null are equivalent for the
    // nullable client fields. Anything actually different goes into the diff.
    const norm = (v) => (v === '' ? null : v);
    if (norm(beforeRaw) === norm(requested)) continue;
    diff[field] = { before: beforeRaw, after: requested };
    effectiveChanges[field] = requested;
  }

  if (Object.keys(effectiveChanges).length === 0) {
    return {
      status: 'ok',
      tool: name,
      previewId: null,
      noop: true,
      message: 'All requested fields already match the current project values.',
      project: {
        id: project.id,
        ...current,
      },
    };
  }

  const { previewId, expiresAt } = savePreview('update_project', {
    projectId: input.projectId,
    changes: effectiveChanges,
    before: current,
  });

  return {
    status: 'ok',
    tool: name,
    previewId,
    expiresAt,
    project: {
      id: project.id,
      ...current,
    },
    diff,
  };

  function errOf(code, message) {
    return { status: 'error', tool: name, error: { code, message } };
  }
}

function mapBackendError(error, projectIdArg) {
  if (error.status === 401 || error.status === 403) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_unauthorized',
        message: 'The MCP token was rejected by the backend.',
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
        message: `Project ${projectIdArg} was not found or you do not have access to it.`,
        backendStatus: 404,
      },
    };
  }
  return {
    status: 'error',
    tool: name,
    error: {
      code: 'backend_error',
      message: error.message ?? 'Unexpected error preparing project update preview.',
      backendStatus: error.status ?? null,
    },
  };
}
