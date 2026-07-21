import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get, put } from '../lib/webbriefClient.js';
import { SUPPORTED_PROJECT_TYPES } from '../../../../shared/documentInvariants.js';

export const name = 'pages_rename';

export const description =
  'What: renames ONE page inside an existing project via PUT /projects/:id/pages (full-replace endpoint), resending every page verbatim (unchanged) except the target page\'s name. This is the lightweight path for a rename — it is equivalent to the set_page_name op in pages_applyEdits but without having to track an expectedVersion manually. Refuses projectType=\'brief\' the same way pages_create / pages.applyEdits do. ' +
  'When: use this when the user just wants to rename a page. For batches that also touch content (headings, paragraphs, CTAs, etc.) alongside a rename, the set_page_name op inside pages_applyEdits still works and lets you combine it with other edits in one versioned batch. ' +
  'Side effects: updates project_pages.name for pageId; every other page (and every other field of the target page) is resent unchanged in the same PUT (full-replace contract); positions are renumbered 0..N contiguous by current order (no reordering happens). ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, project_not_mutable, invalid_project_type (brief refused), page_not_found (pageId not in this project — use projects_get to see the current pages), invalid_request (name is blank after trim, or backend rejected the payload), structure_forbidden (your role can write content but cannot rename pages), version_conflict (an existing page changed elsewhere — re-fetch and retry), backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the page belongs to'),
  pageId: pageId.describe('UUID of the page to rename'),
  name: z.string().min(1).max(120).describe('New display name for the page (trimmed before saving)'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  // 1. Fetch the current project + all pages. GET /projects/:id returns
  //    pages WITH full contentJson/contentHtml (unlike the projects_get tool,
  //    which trims pages down to summaries) — same mechanism pages_create
  //    relies on to resend other pages verbatim in the full-replace PUT.
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

  // 2. Mutability + project type gates (mirrors pages_create / pages.applyEdits).
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
      `Project type '${projectType}' is not supported by pages_rename. ` +
        `Supported: ${SUPPORTED_PROJECT_TYPES.join(', ')}.`,
    );
  }

  const existingPages = (projectData?.pages ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // 3. Locate the target page.
  const targetPage = existingPages.find((p) => p.id === input.pageId);
  if (!targetPage) {
    return errorOf(
      'page_not_found',
      `Page ${input.pageId} was not found in project ${input.projectId}. ` +
        'Use projects_get to see the current pages of this project.',
    );
  }

  // 4. Validate the new name.
  const trimmedName = input.name.trim();
  if (trimmedName.length === 0) {
    return errorOf('invalid_request', 'The new page name cannot be blank after trimming.');
  }

  // 5. Build the full pages payload for PUT /projects/:id/pages, resending
  //    every page verbatim in current order except the target page's name.
  //    This endpoint is full-replace (any page not included gets DELETED),
  //    so every page must be resent, with positions renumbered 0..N
  //    contiguous by current order (no reordering).
  const pagesPayload = existingPages.map((p, index) => ({
    id: p.id,
    name: p.id === input.pageId ? trimmedName : p.name,
    position: index,
    contentJson: p.contentJson ?? p.content_json ?? null,
    contentHtml: p.contentHtml ?? p.content_html ?? '<p></p>',
    seoMetadata: p.seoMetadata ?? p.seo_metadata ?? {},
    contentRules: p.contentRules ?? p.content_rules ?? {},
    version: p.version ?? 1,
    reviewStatus: p.reviewStatus ?? p.review_status ?? 'draft',
    // The backend PUT persists these verbatim (`|| null`), so omitting
    // them would wipe the review baseline of pages under review.
    reviewBaselineVersionId: p.reviewBaselineVersionId ?? p.review_baseline_version_id ?? null,
    reviewBaselineAt: p.reviewBaselineAt ?? p.review_baseline_at ?? null,
    reviewRequestedBy: p.reviewRequestedBy ?? p.review_requested_by ?? null,
  }));

  // 6. PUT.
  let putResponse;
  try {
    putResponse = await put(`/projects/${input.projectId}/pages`, {
      pages: pagesPayload,
      source: 'mcp',
    });
  } catch (error) {
    return mapBackendError(error, input.projectId, 'put');
  }

  const savedPages = putResponse?.pages ?? [];
  const savedPage = savedPages.find((p) => p.id === input.pageId);
  const targetIndex = existingPages.findIndex((p) => p.id === input.pageId);

  return {
    status: 'ok',
    tool: name,
    page: {
      id: input.pageId,
      name: savedPage?.name ?? trimmedName,
      position: savedPage?.position ?? targetIndex,
      version: savedPage?.version ?? targetPage.version ?? 1,
    },
    projectId: input.projectId,
  };

  function errorOf(code, message) {
    return { status: 'error', tool: name, error: { code, message } };
  }
}

function mapBackendError(error, projectIdArg, phase) {
  // The backend uses 409 for version conflict on PUT (another session
  // changed an existing page between our GET and this PUT).
  if (phase === 'put' && error.status === 409) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'version_conflict',
        message:
          'Backend rejected the save because a page was modified in another session. ' +
          'Re-fetch via projects.get / pages.get and retry pages_rename.',
        backendStatus: 409,
        backendBody: error.body ?? null,
        affectedPageId: error.body?.pageId ?? null,
      },
    };
  }
  // The backend rejects structural changes (new/removed/renamed/reordered
  // pages) from roles that can write content but not manage structure.
  if (phase === 'put' && error.status === 403) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'structure_forbidden',
        message: 'Your role can write content but cannot change the project structure (rename pages).',
        backendStatus: 403,
      },
    };
  }
  if (phase === 'put' && error.status === 400) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'invalid_request',
        message: error.body?.error ?? error.message ?? 'Backend rejected the request.',
        backendStatus: 400,
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
      message: error.message ?? 'Unexpected error renaming page.',
      backendStatus: error.status ?? null,
    },
  };
}
