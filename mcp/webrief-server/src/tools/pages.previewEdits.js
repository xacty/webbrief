import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { savePreview } from '../lib/previewStore.js';
import { applyEditsToContentJson, editOpsArraySchema } from '../lib/editOps.js';
import { ensureInvariants, SUPPORTED_PROJECT_TYPES } from '../../../../shared/documentInvariants.js';

export const name = 'pages.previewEdits';

export const description =
  'Applies a list of edit operations to a page in memory and returns the resulting contentJson, ' +
  'a per-op summary, any unmatched-selector warnings, and the repairs that ensureInvariants applied. ' +
  'Nothing is persisted — call pages.applyEdits with the returned previewId + expectedVersion to commit. ' +
  'Rejects brief projects (their content is not editable via MCP v1; only brief responses are).';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project'),
  pageId: pageId.describe('UUID of the page to preview edits on'),
  edits: editOpsArraySchema,
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  let projectData;
  try {
    projectData = await get(`/projects/${input.projectId}`);
  } catch (error) {
    return mapBackendError(error, input.projectId);
  }

  const project = projectData?.project;
  if (!project) {
    return notFound('project_not_found', `Project ${input.projectId} was not found.`);
  }

  if (project.archivedAt ?? project.archived_at) {
    return notMutating(input.projectId, 'archived');
  }
  if (project.trashedAt ?? project.trashed_at) {
    return notMutating(input.projectId, 'trashed');
  }

  const projectType = project.projectType ?? project.project_type;
  if (!SUPPORTED_PROJECT_TYPES.includes(projectType)) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'invalid_project_type',
        message:
          `Project type '${projectType}' is not editable via pages.previewEdits. ` +
          `Supported: ${SUPPORTED_PROJECT_TYPES.join(', ')}.`,
      },
    };
  }

  const page = (projectData?.pages ?? []).find((p) => p.id === input.pageId);
  if (!page) {
    return notFound(
      'page_not_found',
      `Page ${input.pageId} was not found in project ${input.projectId}.`,
    );
  }

  const startingContentJson = page.contentJson ?? page.content_json ?? { type: 'doc', content: [] };
  const startingPageName = page.name;

  // Apply ops to a deep clone.
  let edited;
  try {
    edited = applyEditsToContentJson({
      contentJson: startingContentJson,
      ops: input.edits,
      pageName: startingPageName,
      projectType,
    });
  } catch (err) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'edit_op_failed',
        message: err.message ?? 'Failed to apply edits to contentJson.',
      },
    };
  }

  // Run invariants on the result. Failures here are blocking — the edits
  // produced a document that the editor would reject.
  let normalized;
  try {
    normalized = ensureInvariants(edited.contentJson, projectType);
  } catch (err) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'invariants_failed',
        message: err.message ?? 'Document invariants rejected the edited contentJson.',
      },
    };
  }

  const { previewId, expiresAt } = savePreview('page_edits', {
    projectId: input.projectId,
    pageId: input.pageId,
    projectType,
    pageName: edited.pageName,
    pageVersion: page.version ?? page.version ?? 1,
    contentJson: normalized.contentJson,
    contentHtml: normalized.contentHtml,
    opsApplied: edited.opsApplied,
    warnings: edited.warnings,
    repairs: normalized.repairs,
  });

  return {
    status: 'ok',
    tool: name,
    previewId,
    expiresAt,
    page: {
      id: input.pageId,
      projectId: input.projectId,
      name: edited.pageName,
      version: page.version ?? 1,
      contentJson: normalized.contentJson,
      contentHtml: normalized.contentHtml,
    },
    opsApplied: edited.opsApplied,
    warnings: edited.warnings,
    repairs: normalized.repairs,
  };

  // ────────────────────────────────────────────────────────────────────
  // Local helpers
  // ────────────────────────────────────────────────────────────────────

  function notMutating(id, state) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'project_not_mutable',
        message: `Project ${id} is ${state}. The MCP cannot operate on it.`,
      },
    };
  }
  function notFound(code, message) {
    return { status: 'error', tool: name, error: { code, message } };
  }
}

function mapBackendError(error, contextId) {
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
        message: `Project ${contextId} was not found or you do not have access to it.`,
        backendStatus: 404,
      },
    };
  }
  return {
    status: 'error',
    tool: name,
    error: {
      code: 'backend_error',
      message: error.message ?? 'Unexpected error preparing edit preview.',
      backendStatus: error.status ?? null,
    },
  };
}
