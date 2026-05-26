import { z } from 'zod';
import {
  companyId,
  projectTypeEnum,
  referenceUrls,
  businessType,
} from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';
import { fetchReferenceUrls } from '../lib/urlFetcher.js';
import { savePreview } from '../lib/previewStore.js';

export const name = 'projects.previewCreateFromContent';

export const description =
  'What: takes pasted content + optional reference URLs, fetches the URLs server-side under the SSRF-safe policy, applies cheap heuristics to suggest name + projectType, and returns a previewId + summary. Does NOT persist anything. ' +
  'When: step 1 of the create-project flow. Call projects.createFromPreview with the returned previewId to commit. ' +
  'Side effects: stores a preview entry in process-local memory (10-min TTL, evicted on apply). The reference-URL fetcher hits external hosts under the policy: http/https only, 10s timeout, 2MB cap, no private/local IPs, no redirects. ' +
  'Errors: mcp_token_missing, backend_unauthorized, company_not_found, backend_error.';

export const inputSchema = z.object({
  companyId: companyId.describe('UUID of the company that will own the project'),
  content: z
    .string()
    .min(1)
    .max(200_000)
    .describe('Raw content to analyze — paste, brief text, URL body, etc.'),
  projectType: projectTypeEnum
    .optional()
    .describe('Override the auto-detected project type'),
  businessType: businessType
    .optional()
    .describe(
      "Override the page template family (e.g. 'general', 'tabula_rasa'). " +
        'Only used when projectType is page or brief. Defaults to tabula_rasa.',
    ),
  name: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Override the auto-detected project name'),
  clientName: z
    .string()
    .min(1)
    .max(200)
    .optional()
    .describe('Optional client/customer display name to associate with the project.'),
  clientEmail: z
    .string()
    .email()
    .optional()
    .describe('Optional client email — must be a valid email address.'),
  referenceUrls: referenceUrls.describe(
    'Optional list of http/https URLs the server should fetch as additional context (max 10). ' +
      'Each URL is capped at 10s and 2MB; private/local hosts are rejected.',
  ),
});

// ──────────────────────────────────────────────────────────────────────────────
// Heuristics (no LLM here — the client does that)
// ──────────────────────────────────────────────────────────────────────────────

const MAX_NAME_LEN = 80;

function stripMarkdownAndHtml(line) {
  return line
    .replace(/^#+\s*/, '')
    .replace(/^[*\-•]\s+/, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`]/g, '')
    .trim();
}

export function deriveProjectName(content) {
  const lines = String(content ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer the first markdown heading.
  for (const line of lines) {
    if (/^#{1,6}\s+\S/.test(line)) {
      const cleaned = stripMarkdownAndHtml(line);
      if (cleaned) return truncateName(cleaned);
    }
  }

  // Otherwise the first non-empty line.
  if (lines[0]) return truncateName(stripMarkdownAndHtml(lines[0]));
  return 'Nuevo proyecto';
}

function truncateName(text) {
  if (text.length <= MAX_NAME_LEN) return text;
  return text.slice(0, MAX_NAME_LEN - 1).trimEnd() + '…';
}

export function detectProjectType(content) {
  const text = String(content ?? '').toLowerCase();
  // Order matters: most-specific markers first.
  const faqHits = (text.match(/\bpregunta\b|\bp\?\b|^q:|^a:|\?$/gm) ?? []).length;
  if (faqHits >= 4) return 'faq';

  const briefHits =
    /\bbrief\b|cuestionario|formulario de inicio|brief de inicio/i.test(content)
      ? 1
      : 0;
  if (briefHits) return 'brief';

  // Document = mostly prose, few headings, no clear "page" structure.
  const headings = (text.match(/^#{1,6}\s+/gm) ?? []).length;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (headings <= 1 && wordCount > 250) return 'document';

  return 'page';
}

// ──────────────────────────────────────────────────────────────────────────────
// Handler
// ──────────────────────────────────────────────────────────────────────────────

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  // 1. Validate company access (mirrors the backend's canAccessCompany check).
  let companies;
  try {
    const data = await get('/companies');
    companies = data?.companies ?? [];
  } catch (error) {
    return mapBackendError(error, input.companyId);
  }

  const company = companies.find((c) => c.id === input.companyId);
  if (!company) {
    return {
      status: 'error',
      tool: name,
      error: {
        code: 'company_not_found',
        message: `Company ${input.companyId} was not found or you do not have access to it.`,
      },
    };
  }

  // 2. Fetch reference URLs (policy-enforced).
  const fetchedUrls = await fetchReferenceUrls(input.referenceUrls);

  // 3. Heuristics.
  const detectedType = input.projectType ?? detectProjectType(input.content);
  const finalName = input.name ?? deriveProjectName(input.content);
  const finalBusinessType = input.businessType ?? 'tabula_rasa';

  // 4. Persist the preview for the matching apply call.
  const previewPayload = {
    companyId: input.companyId,
    name: finalName,
    projectType: detectedType,
    businessType: finalBusinessType,
    clientName: input.clientName ?? null,
    clientEmail: input.clientEmail ?? null,
    content: input.content,
    referenceUrls: input.referenceUrls ?? [],
  };
  const { previewId, expiresAt } = savePreview('create_project', previewPayload);

  return {
    status: 'ok',
    tool: name,
    previewId,
    expiresAt,
    preview: {
      companyId: input.companyId,
      companyName: company.name,
      name: finalName,
      projectType: detectedType,
      businessType: finalBusinessType,
      clientName: previewPayload.clientName,
      clientEmail: previewPayload.clientEmail,
    },
    fetchedUrls: fetchedUrls.map((r) => ({
      url: r.url,
      ok: r.ok,
      status: r.status ?? null,
      contentType: r.contentType ?? null,
      bytesRead: r.bytesRead ?? 0,
      truncated: r.truncated ?? false,
      error: r.error ?? null,
      reason: r.reason ?? null,
      // body is included so the client LLM can analyze it; capped at 2MB by the fetcher.
      body: r.body ?? null,
    })),
  };
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
        code: 'company_not_found',
        message: `Company ${contextId} was not found.`,
        backendStatus: 404,
      },
    };
  }
  return {
    status: 'error',
    tool: name,
    error: {
      code: 'backend_error',
      message: error.message ?? 'Unexpected error preparing project preview.',
      backendStatus: error.status ?? null,
    },
  };
}
