/**
 * fase1.test.js — Unit tests for Fase 1 read-only MCP tool handlers.
 *
 * Tests run WITHOUT a live backend. Verifies:
 *   1. Input schema validation (accept / reject expected inputs)
 *   2. module-level session state (companies.selectActive)
 *   3. Missing-token error path (handlers return structured error, not throw)
 *
 * Run with: node src/__tests__/fase1.test.js
 */

import assert from 'node:assert/strict';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    console.log(`  PASS  ${label}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL  ${label}`);
    console.error(`        ${err.message}`);
    failed++;
  }
}

function assertStructuredError(result, code) {
  assert.equal(result.status, 'error', `status should be 'error'`);
  assert.ok(result.error, 'result.error should be present');
  assert.equal(result.error.code, code, `error.code should be '${code}'`);
  assert.ok(typeof result.error.message === 'string', 'error.message should be a string');
}

// ──────────────────────────────────────────────────────────────────────────────
// Session state module tests
// ──────────────────────────────────────────────────────────────────────────────

import {
  getActiveCompanyId,
  setActiveCompanyId,
  clearActiveCompanyId,
} from '../session/activeCompany.js';

console.log('\nsession/activeCompany.js');

await test('initial value is null', () => {
  clearActiveCompanyId();
  assert.equal(getActiveCompanyId(), null);
});

await test('setActiveCompanyId stores the value', () => {
  setActiveCompanyId('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
  assert.equal(getActiveCompanyId(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
});

await test('clearActiveCompanyId resets to null', () => {
  setActiveCompanyId('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  clearActiveCompanyId();
  assert.equal(getActiveCompanyId(), null);
});

// ──────────────────────────────────────────────────────────────────────────────
// mcpToken.js — checkMcpToken helper
// ──────────────────────────────────────────────────────────────────────────────

import { checkMcpToken } from '../auth/mcpToken.js';

console.log('\nauth/mcpToken.js — checkMcpToken');

await test('returns null when token is set', () => {
  const original = process.env.WEBRIEF_MCP_TOKEN;
  // Test fixture only — handlers just check that the env var is non-empty.
  // Avoid the real-token shape (mcpt_ prefix + entropy) so secret scanners
  // like GitGuardian don't flag this as a leaked credential.
  process.env.WEBRIEF_MCP_TOKEN = 'test-fixture-not-a-real-token';
  const result = checkMcpToken('test.tool');
  process.env.WEBRIEF_MCP_TOKEN = original;
  assert.equal(result, null);
});

await test('returns structured error when token is missing', () => {
  const original = process.env.WEBRIEF_MCP_TOKEN;
  delete process.env.WEBRIEF_MCP_TOKEN;
  const result = checkMcpToken('test.tool');
  process.env.WEBRIEF_MCP_TOKEN = original;
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, 'test.tool');
});

// ──────────────────────────────────────────────────────────────────────────────
// Input schema validation tests
// ──────────────────────────────────────────────────────────────────────────────

import * as sessionGetContext from '../tools/session_getContext.js';
import * as companiesSelectActive from '../tools/companies_selectActive.js';
import * as projectsGet from '../tools/projects_get.js';
import * as pagesGet from '../tools/pages_get.js';

const VALID_UUID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

console.log('\nsession.getContext — inputSchema');

await test('accepts empty object', () => {
  const result = sessionGetContext.inputSchema.safeParse({});
  assert.ok(result.success, 'should accept empty input');
});

await test('accepts object with extra keys (stripped by zod)', () => {
  const result = sessionGetContext.inputSchema.safeParse({ extra: 'ignored' });
  assert.ok(result.success);
});

console.log('\ncompanies.selectActive — inputSchema');

await test('accepts valid UUID companyId', () => {
  const result = companiesSelectActive.inputSchema.safeParse({ companyId: VALID_UUID });
  assert.ok(result.success);
});

await test('rejects missing companyId', () => {
  const result = companiesSelectActive.inputSchema.safeParse({});
  assert.ok(!result.success, 'should reject missing companyId');
});

await test('rejects non-UUID companyId', () => {
  const result = companiesSelectActive.inputSchema.safeParse({ companyId: 'not-a-uuid' });
  assert.ok(!result.success, 'should reject non-UUID companyId');
});

console.log('\nprojects.get — inputSchema');

await test('accepts valid UUID projectId', () => {
  const result = projectsGet.inputSchema.safeParse({ projectId: VALID_UUID });
  assert.ok(result.success);
});

await test('rejects missing projectId', () => {
  const result = projectsGet.inputSchema.safeParse({});
  assert.ok(!result.success);
});

await test('rejects non-UUID projectId', () => {
  const result = projectsGet.inputSchema.safeParse({ projectId: 'bad' });
  assert.ok(!result.success);
});

console.log('\npages.get — inputSchema');

await test('accepts valid projectId + pageId', () => {
  const result = pagesGet.inputSchema.safeParse({ projectId: VALID_UUID, pageId: VALID_UUID });
  assert.ok(result.success);
});

await test('rejects missing pageId', () => {
  const result = pagesGet.inputSchema.safeParse({ projectId: VALID_UUID });
  assert.ok(!result.success);
});

await test('rejects missing projectId', () => {
  const result = pagesGet.inputSchema.safeParse({ pageId: VALID_UUID });
  assert.ok(!result.success);
});

// ──────────────────────────────────────────────────────────────────────────────
// Missing-token handler path — handlers must return structured error, not throw
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nHandlers — mcp_token_missing error path (no backend call)');

const saved = process.env.WEBRIEF_MCP_TOKEN;
delete process.env.WEBRIEF_MCP_TOKEN;

await test('session.getContext returns mcp_token_missing', async () => {
  const result = await sessionGetContext.handler({});
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, sessionGetContext.name);
});

await test('companies.selectActive returns mcp_token_missing', async () => {
  const result = await companiesSelectActive.handler({ companyId: VALID_UUID });
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, companiesSelectActive.name);
});

await test('projects.get returns mcp_token_missing', async () => {
  const result = await projectsGet.handler({ projectId: VALID_UUID });
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, projectsGet.name);
});

await test('pages.get returns mcp_token_missing', async () => {
  const result = await pagesGet.handler({ projectId: VALID_UUID, pageId: VALID_UUID });
  assertStructuredError(result, 'mcp_token_missing');
  assert.equal(result.tool, pagesGet.name);
});

if (saved !== undefined) process.env.WEBRIEF_MCP_TOKEN = saved;

// ──────────────────────────────────────────────────────────────────────────────
// companies.selectActive — session state mutation
// ──────────────────────────────────────────────────────────────────────────────

console.log('\ncompanies.selectActive — session state (mock-free path, token missing)');

await test('handler does not mutate state when token is missing', async () => {
  clearActiveCompanyId();
  delete process.env.WEBRIEF_MCP_TOKEN;
  await companiesSelectActive.handler({ companyId: VALID_UUID });
  assert.equal(getActiveCompanyId(), null, 'state should not change when token is missing');
  if (saved !== undefined) process.env.WEBRIEF_MCP_TOKEN = saved;
});

// ──────────────────────────────────────────────────────────────────────────────
// Success-path handler tests — mock global fetch, verify response transforms
// ──────────────────────────────────────────────────────────────────────────────
//
// Each handler calls `get()` from lib/webbriefClient.js, which uses native
// fetch under the hood. We stub `globalThis.fetch` to return canned JSON
// responses keyed by URL, then assert the handler returns the expected output
// shape with the right field names.
//
// Backend URL defaults to http://localhost:3000 (see webbriefClient.js).

const BACKEND_BASE = 'http://localhost:3000/api';
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-success-path';

function makeFetchResponse({ ok = true, status = 200, statusText = 'OK', body = null }) {
  return {
    ok,
    status,
    statusText,
    async json() {
      return body;
    },
  };
}

/**
 * Run `fn` with a mocked global fetch.
 *
 * @param {Record<string, { ok?: boolean, status?: number, statusText?: string, body?: unknown }>} routes
 *        Map from full URL to canned response spec.
 * @param {(calls: Array<{ url: string, options: any }>) => Promise<void>} fn
 */
async function withMockedFetch(routes, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const spec = routes[String(url)];
    if (!spec) {
      throw new Error(`No mock configured for URL: ${url}`);
    }
    return makeFetchResponse(spec);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

// Ensure all success-path tests run with a token set.
process.env.WEBRIEF_MCP_TOKEN = TEST_MCP_TOKEN;

console.log('\nsession.getContext — success path (mocked backend)');

await test('combines /auth/me + /companies + active companyId', async () => {
  clearActiveCompanyId();
  setActiveCompanyId(VALID_UUID);

  const routes = {
    [`${BACKEND_BASE}/auth/me`]: {
      body: {
        user: { id: 'user-1', email: 'alice@example.com', name: 'Alice' },
      },
    },
    [`${BACKEND_BASE}/companies`]: {
      body: {
        companies: [
          { id: VALID_UUID, name: 'Acme', slug: 'acme', membershipRole: 'owner' },
          { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Beta', slug: 'beta' },
        ],
      },
    },
  };

  await withMockedFetch(routes, async (calls) => {
    const result = await sessionGetContext.handler({});

    assert.equal(result.status, 'ok');
    assert.equal(result.tool, sessionGetContext.name);
    assert.deepEqual(result.user, {
      id: 'user-1',
      email: 'alice@example.com',
      name: 'Alice',
    });
    assert.equal(result.companies.length, 2);
    assert.equal(result.companies[0].id, VALID_UUID);
    assert.equal(result.activeCompanyId, VALID_UUID);

    // Verify both backend endpoints were hit
    const urls = calls.map((c) => c.url).sort();
    assert.deepEqual(urls, [
      `${BACKEND_BASE}/auth/me`,
      `${BACKEND_BASE}/companies`,
    ]);
  });

  clearActiveCompanyId();
});

await test('returns activeCompanyId=null when none has been selected', async () => {
  clearActiveCompanyId();

  const routes = {
    [`${BACKEND_BASE}/auth/me`]: { body: { user: { id: 'user-2' } } },
    [`${BACKEND_BASE}/companies`]: { body: { companies: [] } },
  };

  await withMockedFetch(routes, async () => {
    const result = await sessionGetContext.handler({});
    assert.equal(result.status, 'ok');
    assert.equal(result.activeCompanyId, null);
    assert.deepEqual(result.companies, []);
  });
});

console.log('\ncompanies.selectActive — success path (mocked backend)');

await test('validates membership and mutates active state', async () => {
  clearActiveCompanyId();

  const routes = {
    [`${BACKEND_BASE}/companies`]: {
      body: {
        companies: [
          { id: VALID_UUID, name: 'Acme', slug: 'acme', membershipRole: 'editor' },
        ],
      },
    },
  };

  await withMockedFetch(routes, async () => {
    const result = await companiesSelectActive.handler({ companyId: VALID_UUID });

    assert.equal(result.status, 'ok');
    assert.equal(result.tool, companiesSelectActive.name);
    assert.equal(result.activeCompanyId, VALID_UUID);
    assert.deepEqual(result.company, {
      id: VALID_UUID,
      name: 'Acme',
      slug: 'acme',
      membershipRole: 'editor',
    });
    assert.equal(
      getActiveCompanyId(),
      VALID_UUID,
      'module state should be mutated to the selected company',
    );
  });

  clearActiveCompanyId();
});

await test('returns company_not_found and does not mutate state when membership missing', async () => {
  clearActiveCompanyId();

  const routes = {
    [`${BACKEND_BASE}/companies`]: {
      body: {
        companies: [
          { id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', name: 'Other' },
        ],
      },
    },
  };

  await withMockedFetch(routes, async () => {
    const result = await companiesSelectActive.handler({ companyId: VALID_UUID });

    assertStructuredError(result, 'company_not_found');
    assert.equal(getActiveCompanyId(), null, 'state must not change on failed validation');
  });
});

await test('defaults slug and membershipRole to null when backend omits them', async () => {
  clearActiveCompanyId();

  const routes = {
    [`${BACKEND_BASE}/companies`]: {
      body: { companies: [{ id: VALID_UUID, name: 'Minimal' }] },
    },
  };

  await withMockedFetch(routes, async () => {
    const result = await companiesSelectActive.handler({ companyId: VALID_UUID });
    assert.equal(result.status, 'ok');
    assert.equal(result.company.slug, null);
    assert.equal(result.company.membershipRole, null);
  });

  clearActiveCompanyId();
});

console.log('\nprojects.get — success path (mocked backend)');

await test('extracts { project, pages } and projects all field names', async () => {
  const PROJECT_ID = VALID_UUID;
  const COMPANY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const PAGE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: {
          id: PROJECT_ID,
          name: 'Site Redesign',
          companyId: COMPANY_ID,
          projectType: 'website',
          clientName: 'Globex',
          clientEmail: 'hello@globex.com',
          businessType: 'b2b',
          archivedAt: null,
          trashedAt: null,
          updatedAt: '2026-05-01T10:00:00Z',
          // extra field the handler should NOT forward
          internalSecret: 'do-not-leak',
        },
        pages: [
          {
            id: PAGE_ID,
            name: 'Home',
            position: 0,
            version: 3,
            reviewStatus: 'approved',
            updatedAt: '2026-05-02T11:00:00Z',
          },
          {
            id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
            name: 'About',
            position: 1,
            // version, reviewStatus, updatedAt omitted → defaults
          },
        ],
      },
    },
  };

  await withMockedFetch(routes, async (calls) => {
    const result = await projectsGet.handler({ projectId: PROJECT_ID });

    assert.equal(result.status, 'ok');
    assert.equal(result.tool, projectsGet.name);

    assert.deepEqual(result.project, {
      id: PROJECT_ID,
      name: 'Site Redesign',
      companyId: COMPANY_ID,
      projectType: 'website',
      clientName: 'Globex',
      clientEmail: 'hello@globex.com',
      businessType: 'b2b',
      archivedAt: null,
      trashedAt: null,
      updatedAt: '2026-05-01T10:00:00Z',
    });
    assert.equal(
      result.project.internalSecret,
      undefined,
      'handler must not forward unknown backend fields',
    );

    assert.equal(result.pages.length, 2);
    assert.deepEqual(result.pages[0], {
      id: PAGE_ID,
      name: 'Home',
      position: 0,
      version: 3,
      reviewStatus: 'approved',
      updatedAt: '2026-05-02T11:00:00Z',
    });
    // Defaults applied for the second page
    assert.equal(result.pages[1].version, 1);
    assert.equal(result.pages[1].reviewStatus, 'draft');
    assert.equal(result.pages[1].updatedAt, null);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${BACKEND_BASE}/projects/${PROJECT_ID}`);
  });
});

await test('returns empty pages array when backend pages is null', async () => {
  const PROJECT_ID = VALID_UUID;

  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: {
          id: PROJECT_ID,
          name: 'Empty',
          companyId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
          projectType: 'website',
        },
        pages: null,
      },
    },
  };

  await withMockedFetch(routes, async () => {
    const result = await projectsGet.handler({ projectId: PROJECT_ID });
    assert.equal(result.status, 'ok');
    assert.deepEqual(result.pages, []);
    assert.equal(result.project.clientName, null);
  });
});

console.log('\npages.get — success path (mocked backend)');

await test('finds page by id within /projects/:id response', async () => {
  const PROJECT_ID = VALID_UUID;
  const PAGE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: { id: PROJECT_ID, name: 'P', companyId: 'c', projectType: 'website' },
        pages: [
          { id: 'other-id', name: 'Other' },
          {
            id: PAGE_ID,
            name: 'Home',
            position: 0,
            contentHtml: '<h1>Hi</h1>',
            contentJson: { type: 'doc', content: [] },
            seoMetadata: { title: 'Home' },
            version: 7,
            reviewStatus: 'approved',
            updatedAt: '2026-05-03T09:00:00Z',
          },
        ],
      },
    },
  };

  await withMockedFetch(routes, async () => {
    const result = await pagesGet.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });

    assert.equal(result.status, 'ok');
    assert.equal(result.tool, pagesGet.name);
    assert.deepEqual(result.page, {
      id: PAGE_ID,
      projectId: PROJECT_ID,
      name: 'Home',
      position: 0,
      contentHtml: '<h1>Hi</h1>',
      contentJson: { type: 'doc', content: [] },
      seoMetadata: { title: 'Home' },
      version: 7,
      reviewStatus: 'approved',
      updatedAt: '2026-05-03T09:00:00Z',
    });
  });
});

await test('returns page_not_found when pageId is absent from project', async () => {
  const PROJECT_ID = VALID_UUID;
  const MISSING_PAGE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: { id: PROJECT_ID, name: 'P', companyId: 'c', projectType: 'website' },
        pages: [{ id: 'some-other-page', name: 'X' }],
      },
    },
  };

  await withMockedFetch(routes, async () => {
    const result = await pagesGet.handler({
      projectId: PROJECT_ID,
      pageId: MISSING_PAGE_ID,
    });
    assertStructuredError(result, 'page_not_found');
  });
});

await test('applies defaults for omitted page fields', async () => {
  const PROJECT_ID = VALID_UUID;
  const PAGE_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: { id: PROJECT_ID, name: 'P', companyId: 'c', projectType: 'website' },
        pages: [{ id: PAGE_ID, name: 'Minimal', position: 0 }],
      },
    },
  };

  await withMockedFetch(routes, async () => {
    const result = await pagesGet.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });
    assert.equal(result.status, 'ok');
    assert.equal(result.page.contentHtml, null);
    assert.equal(result.page.contentJson, null);
    assert.deepEqual(result.page.seoMetadata, {});
    assert.equal(result.page.version, 1);
    assert.equal(result.page.reviewStatus, 'draft');
    assert.equal(result.page.updatedAt, null);
  });
});

// Restore env state after success-path block.
if (saved !== undefined) {
  process.env.WEBRIEF_MCP_TOKEN = saved;
} else {
  delete process.env.WEBRIEF_MCP_TOKEN;
}

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
