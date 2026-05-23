#!/usr/bin/env node
/**
 * WeBrief MCP Server — v1 stdio transport
 *
 * Environment variables:
 *   WEBRIEF_MCP_TOKEN   Required. The mcpt_* token for authenticating with the WeBrief backend.
 *   WEBRIEF_BACKEND_URL Optional. Defaults to http://localhost:3000.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as tools from './tools/index.js';

// Validate required env vars at startup (non-fatal in Fase 0 since all handlers
// are no-ops, but the warning is useful during integration testing).
if (!process.env.WEBRIEF_MCP_TOKEN) {
  process.stderr.write(
    '[webbrief-mcp] WARNING: WEBRIEF_MCP_TOKEN is not set. ' +
      'All tool calls will fail with an auth error once handlers are implemented.\n'
  );
}

const SERVER_INSTRUCTIONS = `# WeBrief MCP — agent playbook

You are operating on behalf of a WeBrief user. WeBrief is a fullstack app
for managing client briefs and editable web copy (websites, FAQ pages,
documents, intake forms). Your job is to help the user create, read and
edit their projects and pages through the 12 tools below.

## Read order (always, on first connect)
1. session.getContext — discover the user profile, the active company
   (if one was set), and the list of companies the user can access.
2. If the user has >1 company, call companies.selectActive BEFORE any
   mutation. The active company is a session default, not a hard binding —
   tools that mutate still require explicit companyId arguments.

## Flow: create a new project
1. projects.previewCreateFromContent — pass content (paste/text) plus
   any optional reference URLs (server fetches them; client gets the
   body back to read). Returns a previewId and auto-detected fields.
2. projects.createFromPreview — confirm with previewId. Accept an
   optional 'overrides' bag if the user wants to tweak name/clientName/
   projectType/businessType/clientEmail at apply time.

## Flow: update an existing project's metadata
1. projects.previewUpdate — pass changes (name/clientName/clientEmail/
   businessType/projectType). Returns a per-field diff vs current.
2. projects.applyUpdate — commit with previewId.

## Flow: read project structure
1. projects.get — returns project meta + page list (id, name, version).
2. pages.get — returns full page content (contentJson, contentHtml,
   seoMetadata, version).

## Flow: edit a page's content / SEO
1. pages.get — record the current version!
2. pages.previewEdits — try the edit list. See warnings (unmatched
   selectors) and repairs (invariants normalization).
3. pages.applyEdits — pass expectedVersion = the version from step 1.
   On version_conflict: re-fetch pages.get and replan against the
   currentSnapshot the error returned.

## Flow: prefill a brief (read-only for now)
- brief.previewPrefill returns the project's brief questions + the
  client content for you to map locally. v1 has NO apply step for brief
  responses yet — surface the proposed answers to the user; the user
  fills them via the WeBrief UI.

## Flow: draft a new page within an existing project (preview-only)
- pages.previewDraft returns project context + fetched URL bodies so you
  can build a draft locally. The apply step is currently to call
  pages.applyEdits with insert_section ops on a page-type project.

## Hard limits — do NOT try to work around these
- Image / asset upload: NOT supported. The user uploads images via the
  WeBrief UI. You CAN embed an already-public image URL into content via
  the insert_image_by_url op.
- Archived or trashed projects: refused at every mutation tool. Restore
  is UI-only.
- Brief project content edits: refused. The brief structure (questions)
  is owned by the editor UI; only brief responses are mutable, and that
  flow is preview-only in v1.
- URL fetch policy: only http/https; 10s timeout; 2MB cap; private/local
  hosts (RFC 1918, loopback) refused; no redirects followed.

## Edit operation cheatsheet (pages.applyEdits.edits[] discriminated union)
Each op has an 'op' field. Ops that fail to find their target record a
warning (not an error) so a single typo doesn't abort a batch.

  set_page_name        rename the page (project_pages.name)
  set_section_name     rename a sectionDivider (by sectionId)
  set_heading_text     change heading text — scoped by sectionId/level/text
  replace_paragraph    replace a paragraph — by paragraphIndex or matchText
  insert_section       add a new section, optionally with heading + body
  delete_section       remove a section and its body up to next divider
  find_replace         bulk text replace; regex meta-chars escaped; case-
                       insensitive by default; optional sectionId scope
  set_faq_question     change the heading of a FAQ section (faq projects)
  set_faq_answer       collapse a FAQ section's body into one paragraph
  insert_cta           add a CTA button { ctaText, ctaUrl } into a section
  insert_image_by_url  embed an image by public URL (no upload)
  set_seo_metadata     change titleTag / metaDescription / urlSlug
                       (merge=true by default; merge=false replaces)

## Error code reference
  mcp_token_missing         The MCP token env var is not set or empty
  backend_unauthorized      The MCP token was rejected by the backend
  backend_error             Generic backend failure (check backendStatus)
  company_not_found         CompanyId is not in the user's accessible set
  project_not_found         ProjectId not found or no access
  project_not_mutable       Project is archived or trashed
  page_not_found            PageId not in this project
  invalid_project_type      Tool refused this project type (e.g. brief)
  preview_not_found         PreviewId expired (>10 min) or already applied
  preview_kind_mismatch     PreviewId is for a different tool
  preview_company_mismatch  Argument companyId differs from the stored one
  preview_project_mismatch  Argument projectId differs from the stored one
  version_conflict          expectedVersion < currentVersion — see snapshot
  invariants_failed         Edited contentJson violates document rules
  edit_op_failed            An op threw during application (rare)`;

const server = new McpServer(
  {
    name: 'webbrief',
    version: '0.1.0',
  },
  {
    capabilities: { tools: {} },
    instructions: SERVER_INSTRUCTIONS,
  }
);

// Register all 12 v1 tools
for (const tool of Object.values(tools)) {
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema,
    },
    async (input) => {
      const result = await tool.handler(input);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );
}

// Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);

process.stderr.write('[webbrief-mcp] Server started on stdio transport.\n');
