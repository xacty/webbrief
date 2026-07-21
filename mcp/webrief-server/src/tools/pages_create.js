import { z } from 'zod';
import { projectId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get, put } from '../lib/webbriefClient.js';
import { makeSectionDivider, makeHeading, makeParagraph } from '../lib/editOps.js';
import { ensureInvariants, SUPPORTED_PROJECT_TYPES } from '../../../../shared/documentInvariants.js';

export const name = 'pages_create';

export const description =
  'What: creates a NEW page inside an existing project (page/document/faq — brief refused, same as pages.applyEdits) via PUT /projects/:id/pages (full-replace endpoint). Builds the page contentJson from optional sections (name/headingLevel/headingText/paragraphs) or a single default empty section ("Sección 1") if none are given, serializes contentHtml with the same invariants module pages.applyEdits uses, and resends every existing page verbatim so nothing else is lost, renamed, or reordered. Returns the new page id/name/position/version. ' +
  'When: use this to add a page/document/faq page to a project — either blank or pre-populated with initial section content. To edit fine-grained content afterward (headings, paragraphs, CTAs, images, SEO) use pages.previewEdits / pages.applyEdits on the returned page id. ' +
  'Side effects: inserts a new project_pages row at the requested position (default: end); every other page in the project is resent unchanged in the same PUT (full-replace contract) and positions are renumbered 0..N contiguous. ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, project_not_mutable, invalid_project_type (brief refused), invariants_failed, structure_forbidden (your role can write content but cannot add pages), version_conflict (an existing page changed elsewhere — re-fetch and retry), invalid_request (backend rejected the payload), backend_error.';

const sectionInput = z.object({
  name: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe('Section display name. Omit to let auto-naming assign "Sección N" (or "Pregunta Frecuente N" for faq projects).'),
  headingLevel: z
    .number()
    .int()
    .min(1)
    .max(6)
    .optional()
    .describe('Heading level for headingText. Defaults to 2 when headingText is set without a level.'),
  headingText: z
    .string()
    .min(1)
    .max(300)
    .optional()
    .describe('Optional heading inserted right after the section divider.'),
  paragraphs: z
    .array(z.string().min(1).max(5000))
    .max(30)
    .optional()
    .describe('Optional paragraph texts inserted after the heading (if any). If a section has no heading and no paragraphs, one empty paragraph is inserted so it stays editable.'),
});

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the new page will belong to'),
  name: z.string().min(1).max(120).describe('Display name for the new page'),
  position: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('0-based index among the project pages where the new page should be inserted. Omit to append at the end. Out-of-range values are clamped to the valid range.'),
  sections: z
    .array(sectionInput)
    .max(20)
    .optional()
    .describe('Initial sections for the new page. Omit or pass [] to create the page with a single empty default section ("Sección 1").'),
});

// Mirrors the auto-name patterns in shared/documentInvariants.js
// (AUTO_SECTION_NAME_RE / AUTO_FAQ_SECTION_NAME_RE) so sections built here
// without an explicit name are recognized as auto-named and stay correctly
// renumbered by ensureInvariants / future pages.applyEdits calls.
function autoSectionName(projectType, ordinal) {
  if (projectType === 'faq') return `Pregunta Frecuente ${ordinal}`;
  return `Sección ${ordinal}`;
}

// Builds a ProseMirror `doc` from the tool's `sections` input (or a single
// default empty section when omitted/empty). Always emits a sectionDivider
// per section — for projectType='document' (linear, no dividers allowed),
// ensureInvariants() strips the dividers right back out via
// repairDocumentLinear, leaving the headings/paragraphs as flat linear
// content. This lets one builder serve page/faq/document alike.
function buildDocFromSections(sections, projectType) {
  const list = Array.isArray(sections) && sections.length > 0 ? sections : null;
  const content = [];

  if (!list) {
    const sectionId = crypto.randomUUID();
    content.push(makeSectionDivider(autoSectionName(projectType, 1), sectionId));
    content.push(makeParagraph(''));
    return { type: 'doc', content };
  }

  list.forEach((section, index) => {
    const sectionId = crypto.randomUUID();
    const sectionName = section.name ?? autoSectionName(projectType, index + 1);
    content.push(makeSectionDivider(sectionName, sectionId));

    let bodyNodeCount = 0;
    if (section.headingText) {
      content.push(makeHeading(section.headingLevel ?? 2, section.headingText));
      bodyNodeCount += 1;
    }
    if (Array.isArray(section.paragraphs) && section.paragraphs.length > 0) {
      for (const text of section.paragraphs) {
        content.push(makeParagraph(text));
        bodyNodeCount += 1;
      }
    }
    if (bodyNodeCount === 0) {
      // Keep the section editable even if the caller supplied neither a
      // heading nor paragraphs for it.
      content.push(makeParagraph(''));
    }
  });

  return { type: 'doc', content };
}

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  // 1. Fetch the current project + all pages. GET /projects/:id returns
  //    pages WITH full contentJson/contentHtml (unlike the projects_get tool,
  //    which trims pages down to summaries) — same mechanism pages.applyEdits
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

  // 2. Mutability + project type gates (mirrors pages.applyEdits).
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
      `Project type '${projectType}' is not supported by pages.create. ` +
        `Supported: ${SUPPORTED_PROJECT_TYPES.join(', ')}.`,
    );
  }

  const existingPages = (projectData?.pages ?? [])
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  // 3. Build + validate the new page's contentJson.
  const rawDoc = buildDocFromSections(input.sections, projectType);

  let normalized;
  try {
    normalized = ensureInvariants(rawDoc, projectType);
  } catch (err) {
    return errorOf(
      'invariants_failed',
      err.message ?? 'Document invariants rejected the new page contentJson.',
    );
  }

  const newPageId = crypto.randomUUID();
  const insertionIndex = Math.max(
    0,
    Math.min(input.position ?? existingPages.length, existingPages.length),
  );

  const newPage = {
    id: newPageId,
    name: input.name,
    contentJson: normalized.contentJson,
    contentHtml: normalized.contentHtml,
    seoMetadata: {},
    contentRules: {},
    version: 1,
    reviewStatus: 'draft',
  };

  const orderedPages = existingPages.slice();
  orderedPages.splice(insertionIndex, 0, newPage);

  // 4. Build the full pages payload for PUT /projects/:id/pages. This
  //    endpoint is full-replace (any page not included gets DELETED), so
  //    every existing page must be resent verbatim with positions
  //    renumbered 0..N contiguous around the inserted page.
  const pagesPayload = orderedPages.map((p, index) => {
    if (p.id === newPageId) {
      return {
        id: p.id,
        name: p.name,
        position: index,
        contentJson: p.contentJson,
        contentHtml: p.contentHtml,
        seoMetadata: p.seoMetadata,
        contentRules: p.contentRules,
        version: p.version,
        reviewStatus: p.reviewStatus,
      };
    }
    return {
      id: p.id,
      name: p.name,
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
    };
  });

  // 5. PUT.
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
  const savedPage = savedPages.find((p) => p.id === newPageId);

  return {
    status: 'ok',
    tool: name,
    page: {
      id: newPageId,
      name: savedPage?.name ?? input.name,
      position: savedPage?.position ?? insertionIndex,
      version: savedPage?.version ?? 1,
    },
    pageCount: pagesPayload.length,
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
          'Re-fetch via projects.get / pages.get and retry pages.create.',
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
        message: 'Your role can write content but cannot change the project structure (add pages).',
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
      message: error.message ?? 'Unexpected error creating page.',
      backendStatus: error.status ?? null,
    },
  };
}
