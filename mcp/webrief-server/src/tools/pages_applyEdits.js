import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get, put } from '../lib/webbriefClient.js';
import { applyEditsToContentJson, editOpsArraySchema } from '../lib/editOps.js';
import { ensureInvariants, SUPPORTED_PROJECT_TYPES } from '../../../../shared/documentInvariants.js';

export const name = 'pages_applyEdits';

export const description =
  'What: persists a batch of edit ops to a page. Re-runs the ops against the freshest snapshot the backend has, normalizes via ensureInvariants, and writes the result through PUT /projects/:id/pages (full-replace endpoint — backend bumps version). Returns the saved page (with new version) + opsApplied + warnings + repairs. ' +
  'When: commit a batch you already validated with pages.previewEdits. Pass expectedVersion = the version you saw in pages.get. ' +
  'Side effects: writes contentJson + contentHtml + seoMetadata + name to the database; the backend rotates version. Other pages in the project are sent verbatim in the same PUT (full-replace contract — never sent with stale local copies). ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, project_not_mutable, page_not_found, invalid_project_type (brief refused), version_conflict (returns currentVersion + currentSnapshot for replan), invariants_failed, edit_op_failed, backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project'),
  pageId: pageId.describe('UUID of the page to edit'),
  expectedVersion: z
    .number()
    .int()
    .min(1)
    .describe('Version of the page the caller last observed via pages.get'),
  edits: editOpsArraySchema,
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  // 1. Fetch the current project + all pages.
  let projectData;
  try {
    projectData = await get(`/projects/${input.projectId}`);
  } catch (error) {
    return mapBackendError(error, input.projectId, 'fetch');
  }

  const project = projectData?.project;
  if (!project) {
    return errorOf('project_not_found', `Project ${input.projectId} was not found.`);
  }

  // 2. Mutability gates (mirrors backend's role + state checks).
  if (project.archivedAt ?? project.archived_at) {
    return errorOf(
      'project_not_mutable',
      `Project ${input.projectId} is archived. The MCP cannot operate on it.`,
    );
  }
  if (project.trashedAt ?? project.trashed_at) {
    return errorOf(
      'project_not_mutable',
      `Project ${input.projectId} is trashed. The MCP cannot operate on it.`,
    );
  }

  const projectType = project.projectType ?? project.project_type;
  if (!SUPPORTED_PROJECT_TYPES.includes(projectType)) {
    return errorOf(
      'invalid_project_type',
      `Project type '${projectType}' is not editable via pages.applyEdits. ` +
        `Supported: ${SUPPORTED_PROJECT_TYPES.join(', ')}.`,
    );
  }

  const allPages = projectData?.pages ?? [];
  const targetPage = allPages.find((p) => p.id === input.pageId);
  if (!targetPage) {
    return errorOf(
      'page_not_found',
      `Page ${input.pageId} was not found in project ${input.projectId}.`,
    );
  }

  // 3. Version check. Backend stores `version` (starts at 1).
  const currentVersion = targetPage.version ?? 1;
  if (currentVersion !== input.expectedVersion) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'version_conflict',
        message:
          `Expected version ${input.expectedVersion} but page is at version ${currentVersion}. ` +
          'Re-fetch the page via pages.get and replan your edits against the current snapshot.',
        currentVersion,
        currentSnapshot: {
          id: targetPage.id,
          projectId: input.projectId,
          name: targetPage.name,
          version: currentVersion,
          contentJson: targetPage.contentJson ?? targetPage.content_json ?? null,
          contentHtml: targetPage.contentHtml ?? targetPage.content_html ?? null,
          reviewStatus: targetPage.reviewStatus ?? targetPage.review_status ?? 'draft',
          updatedAt: targetPage.updatedAt ?? targetPage.updated_at ?? null,
        },
      },
    };
  }

  // 4. Apply ops to the current contentJson + seoMetadata.
  const startingContentJson =
    targetPage.contentJson ?? targetPage.content_json ?? { type: 'doc', content: [] };
  const startingSeoMetadata =
    targetPage.seoMetadata ?? targetPage.seo_metadata ?? {};

  let edited;
  try {
    edited = applyEditsToContentJson({
      contentJson: startingContentJson,
      ops: input.edits,
      pageName: targetPage.name,
      seoMetadata: startingSeoMetadata,
      projectType,
    });
  } catch (err) {
    return errorOf('edit_op_failed', err.message ?? 'Failed to apply edits.');
  }

  // 5. Invariants. Blocking on apply.
  let normalized;
  try {
    normalized = ensureInvariants(edited.contentJson, projectType);
  } catch (err) {
    return errorOf(
      'invariants_failed',
      err.message ?? 'Document invariants rejected the edited contentJson.',
    );
  }

  // 6. Build the full pages array for PUT /projects/:id/pages.
  //    Backend treats this endpoint as full-replace (any page not in the
  //    payload is DELETED), so we must include every existing page verbatim
  //    with the target swapped in.
  const updatedPagesPayload = allPages.map((p) => {
    if (p.id === input.pageId) {
      return {
        id: p.id,
        name: edited.pageName,
        position: p.position,
        contentJson: normalized.contentJson,
        contentHtml: normalized.contentHtml,
        seoMetadata: edited.seoMetadata ?? {},
        contentRules: p.contentRules ?? p.content_rules ?? {},
        version: currentVersion, // backend bumps to currentVersion + 1
        reviewStatus: p.reviewStatus ?? p.review_status ?? 'draft',
      };
    }
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      contentJson: p.contentJson ?? p.content_json ?? null,
      contentHtml: p.contentHtml ?? p.content_html ?? '<p></p>',
      seoMetadata: p.seoMetadata ?? p.seo_metadata ?? {},
      contentRules: p.contentRules ?? p.content_rules ?? {},
      version: p.version ?? 1,
      reviewStatus: p.reviewStatus ?? p.review_status ?? 'draft',
    };
  });

  // 7. PUT.
  let putResponse;
  try {
    putResponse = await put(`/projects/${input.projectId}/pages`, {
      pages: updatedPagesPayload,
      source: 'mcp',
    });
  } catch (error) {
    return mapBackendError(error, input.projectId, 'put', input.pageId);
  }

  // 8. Locate the saved page in the response so we can return the new version.
  const savedPages = putResponse?.pages ?? [];
  const savedPage = savedPages.find((p) => p.id === input.pageId);
  const newVersion = savedPage?.version ?? currentVersion + 1;

  return {
    status: 'ok',
    tool: name,
    page: {
      id: input.pageId,
      projectId: input.projectId,
      name: edited.pageName,
      version: newVersion,
      contentJson: normalized.contentJson,
      contentHtml: normalized.contentHtml,
      seoMetadata: edited.seoMetadata ?? {},
      reviewStatus: savedPage?.reviewStatus ?? targetPage.reviewStatus ?? 'draft',
      updatedAt: savedPage?.updatedAt ?? null,
    },
    opsApplied: edited.opsApplied,
    warnings: edited.warnings,
    repairs: normalized.repairs,
  };

  function errorOf(code, message) {
    return { status: 'error', tool: name, error: { code, message } };
  }
}

function mapBackendError(error, projectIdArg, phase, pageIdArg) {
  // The backend uses 409 for version conflict on PUT. Surface that explicitly
  // so the caller doesn't conflate it with a 401/403.
  if (phase === 'put' && error.status === 409) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'version_conflict',
        message:
          'Backend rejected the save because the page was modified in another session. ' +
          'Re-fetch via pages.get and replan your edits.',
        currentVersion: null, // unknown until we re-fetch
        backendStatus: 409,
        backendBody: error.body ?? null,
        affectedPageId: error.body?.pageId ?? pageIdArg ?? null,
      },
    };
  }
  if (error.status === 401 || error.status === 403) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_unauthorized',
        message:
          'The MCP token was rejected by the backend, or your role cannot edit this page.',
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
      message: error.message ?? 'Unexpected error applying edits.',
      backendStatus: error.status ?? null,
    },
  };
}
