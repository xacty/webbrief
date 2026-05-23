import { z } from 'zod';
import { projectId, referenceUrls } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { fetchReferenceUrls } from '../lib/urlFetcher.js';
import { savePreview } from '../lib/previewStore.js';

export const name = 'pages.previewDraft';

export const description =
  'What: returns the project context (existing pages, projectType) + a suggested page name and position for a NEW page, alongside echo of the user content and bodies of any reference URLs the server fetched. The CLIENT builds the actual draft locally — this server never calls an LLM. ' +
  'When: use to gather material before drafting a new page. To persist the draft, call pages.applyEdits with insert_section ops on the same project. ' +
  'Side effects: stores a preview entry in memory (kind=page_draft, 10-min TTL). Reference URLs are fetched under the SSRF-safe policy: http/https only, 10s timeout, 2MB cap, no private hosts, no redirects. ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, project_not_mutable, invalid_project_type (rejects brief — use brief.previewPrefill there), backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the draft page will belong to'),
  content: z
    .string()
    .min(1)
    .max(200_000)
    .describe('Raw content to turn into a page draft'),
  pageName: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Suggested name for the new page (defaults to first heading / first line)'),
  referenceUrls: referenceUrls.describe(
    'Optional http/https URLs the server should fetch as additional context (max 10).',
  ),
});

const MAX_NAME_LEN = 80;

function truncate(text) {
  if (text.length <= MAX_NAME_LEN) return text;
  return text.slice(0, MAX_NAME_LEN - 1).trimEnd() + '…';
}

export function derivePageName(content) {
  const lines = String(content ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines) {
    if (/^#{1,6}\s+\S/.test(line)) {
      return truncate(line.replace(/^#+\s*/, '').replace(/<[^>]+>/g, '').trim());
    }
  }
  if (lines[0]) return truncate(lines[0].replace(/<[^>]+>/g, '').trim());
  return 'Nueva página';
}

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
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'project_not_found',
        message: `Project ${input.projectId} was not found.`,
      },
    };
  }

  const projectType = project.projectType ?? project.project_type;
  if (projectType === 'brief') {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'invalid_project_type',
        message:
          `Project ${input.projectId} is of type 'brief'. ` +
          'pages.previewDraft does not operate on brief projects — use brief.previewPrefill instead.',
      },
    };
  }

  if (project.archivedAt ?? project.archived_at) {
    return notMutatingError('archived');
  }
  if (project.trashedAt ?? project.trashed_at) {
    return notMutatingError('trashed');
  }

  const fetchedUrls = await fetchReferenceUrls(input.referenceUrls);
  const pageName = input.pageName ?? derivePageName(input.content);

  const existingPages = (data?.pages ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    position: p.position,
    reviewStatus: p.reviewStatus ?? p.review_status ?? 'draft',
  }));

  const nextPosition = existingPages.length;

  const { previewId, expiresAt } = savePreview('page_draft', {
    projectId: input.projectId,
    projectType,
    pageName,
    nextPosition,
    content: input.content,
    referenceUrls: input.referenceUrls ?? [],
  });

  return {
    status: 'ok',
    tool: name,
    previewId,
    expiresAt,
    project: {
      id: project.id,
      name: project.name,
      projectType,
    },
    draft: {
      pageName,
      position: nextPosition,
    },
    existingPages,
    content: input.content,
    fetchedUrls: fetchedUrls.map((r) => ({
      url: r.url,
      ok: r.ok,
      status: r.status ?? null,
      contentType: r.contentType ?? null,
      bytesRead: r.bytesRead ?? 0,
      truncated: r.truncated ?? false,
      error: r.error ?? null,
      reason: r.reason ?? null,
      body: r.body ?? null,
    })),
  };

  function notMutatingError(state) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'project_not_mutable',
        message: `Project ${input.projectId} is ${state}. The MCP cannot operate on it.`,
      },
    };
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
      message: error.message ?? 'Unexpected error preparing page draft preview.',
      backendStatus: error.status ?? null,
    },
  };
}
