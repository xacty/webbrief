import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { listSections, textOfNode } from '../lib/editOps.js';

export const name = 'sections_list';

export const description =
  'What: returns a LIGHTWEIGHT structural index of one page\'s sections — for each section: ' +
  'sectionId/sectionName/position/headings (level+text)/blockCount — WITHOUT the section body content. ' +
  'When: use to cheaply discover a page\'s sectionId values and heading outline before calling ' +
  'pages_previewEdits / pages_applyEdits, instead of downloading and parsing the full contentJson via pages.get. ' +
  'Note: sectionName may be auto-generated (e.g. "Sección 1") or null. ' +
  'Side effects: none (read-only). ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, page_not_found, backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project the page belongs to'),
  pageId: pageId.describe('UUID of the page whose section index to list'),
});

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  try {
    // No standalone page endpoint exists — fetch the project which returns all pages with full content
    const data = await get(`/projects/${input.projectId}`);
    const { pages } = data;

    const page = (pages ?? []).find((p) => p.id === input.pageId);

    if (!page) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'page_not_found',
          message: `Page ${input.pageId} was not found in project ${input.projectId}.`,
        },
      };
    }

    const doc = page.contentJson ?? { type: 'doc', content: [] };
    const sections = (doc?.content ? listSections(doc) : [])
      .filter((s) => s.divider)
      .map((s, index) => {
        const headings = doc.content
          .slice(s.bodyStart, s.bodyEnd)
          .filter((n) => n?.type === 'heading')
          .map((n) => ({ level: n.attrs?.level ?? null, text: textOfNode(n) }));

        return {
          sectionId: s.divider.attrs?.sectionId ?? null,
          sectionName: s.divider.attrs?.sectionName ?? null,
          position: index,
          headings,
          blockCount: s.bodyEnd - s.bodyStart,
        };
      });

    return {
      status: 'ok',
      tool: name,
      projectId: input.projectId,
      pageId: input.pageId,
      pageName: page.name,
      version: page.version ?? 1,
      reviewStatus: page.reviewStatus ?? 'draft',
      total: sections.length,
      sections,
    };
  } catch (error) {
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
          message: `Project ${input.projectId} was not found or you do not have access to it.`,
          backendStatus: 404,
        },
      };
    }

    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_error',
        message: error.message ?? 'Unexpected error listing sections.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
