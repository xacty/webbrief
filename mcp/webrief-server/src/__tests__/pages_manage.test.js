/**
 * pages_manage.test.js — Unit tests for the pages_delete and pages_rename MCP
 * tools.
 *
 * Covers:
 *   pages_delete:
 *     - inputSchema (rejects non-uuid pageId, missing projectId)
 *     - handler happy path: deletes the middle page of 3, PUT body carries
 *       exactly the 2 remaining pages with positions renumbered 0..1 and
 *       content/version/reviewBaseline* verbatim
 *     - page_not_found (no PUT call)
 *     - invalid_request when deleting the last remaining page (no PUT call)
 *     - invalid_project_type (brief) / project_not_mutable (archived)
 *     - backend error mapping: PUT 403 -> structure_forbidden, PUT 409 ->
 *       version_conflict, GET 404 -> project_not_found
 *   pages_rename:
 *     - inputSchema (rejects empty name, name over 120 chars)
 *     - handler happy path: renames the 2nd of 3 pages, PUT body has only the
 *       target's name changed, others verbatim in order, positions 0..2,
 *       reviewBaseline* present
 *     - invalid_request when the new name is blank after trim (whitespace
 *       only), no PUT call
 *     - page_not_found / invalid_project_type (brief)
 *     - PUT 403 -> structure_forbidden
 *     - response echoes the version bump from a dynamic PUT response
 *   Registration smoke test: 20 tools including pages_delete / pages_rename.
 *
 * Run with: node src/__tests__/pages_manage.test.js
 */

import assert from 'node:assert/strict';

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
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    failed++;
  }
}

function assertStructuredError(result, code) {
  assert.equal(result.status, 'error', "status should be 'error'");
  assert.ok(result.error, 'result.error should be present');
  assert.equal(result.error.code, code, `error.code should be '${code}'`);
}

const BACKEND_BASE = 'http://localhost:3000/api';
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-pages-manage';
process.env.WEBRIEF_MCP_TOKEN = TEST_MCP_TOKEN;

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

// Same shape as pages_create.test.js's withMockedFetch: a route value may be
// a function `({ body, calls }) => spec` so tests can build a response from
// the actual PUT payload, or `{ networkError: true }` to simulate fetch()
// itself rejecting.
async function withMockedFetch(routes, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const u = String(url);
    const method = options?.method ?? 'GET';
    const body = options?.body ? JSON.parse(options.body) : null;
    calls.push({ url: u, method, body });
    const key = `${method} ${u}`;
    let spec = routes[key] ?? routes[u];
    if (typeof spec === 'function') spec = spec({ body, calls });
    if (!spec) throw new Error(`No mock configured for: ${key}`);
    if (spec.networkError) throw new Error('simulated network failure');
    return makeFetchResponse(spec);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

import * as pagesDelete from '../tools/pages_delete.js';
import * as pagesRename from '../tools/pages_rename.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PAGE_A_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PAGE_B_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PAGE_C_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const OTHER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

function buildPage(overrides = {}) {
  return {
    id: PAGE_A_ID,
    name: 'Inicio',
    position: 0,
    version: 3,
    reviewStatus: 'draft',
    contentJson: {
      type: 'doc',
      content: [
        { type: 'sectionDivider', attrs: { sectionId: 'sec-a1', sectionName: 'Sección 1' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo A' }] },
      ],
    },
    contentHtml: '<p>cuerpo A</p>',
    seoMetadata: { titleTag: 'Inicio SEO' },
    contentRules: { locked: false },
    reviewBaselineVersionId: 'baseline-a',
    reviewBaselineAt: '2026-06-01T00:00:00Z',
    reviewRequestedBy: 'user-a',
    ...overrides,
  };
}

function buildPageA() {
  return buildPage();
}

function buildPageB() {
  return buildPage({
    id: PAGE_B_ID,
    name: 'Servicios',
    position: 1,
    version: 5,
    reviewStatus: 'in_review',
    contentJson: {
      type: 'doc',
      content: [
        { type: 'sectionDivider', attrs: { sectionId: 'sec-b1', sectionName: 'Sección 1' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo B' }] },
      ],
    },
    contentHtml: '<p>cuerpo B</p>',
    seoMetadata: { urlSlug: 'servicios' },
    contentRules: {},
    reviewBaselineVersionId: 'baseline-b',
    reviewBaselineAt: '2026-06-02T00:00:00Z',
    reviewRequestedBy: 'user-b',
  });
}

function buildPageC() {
  return buildPage({
    id: PAGE_C_ID,
    name: 'Contacto',
    position: 2,
    version: 1,
    reviewStatus: 'draft',
    contentJson: {
      type: 'doc',
      content: [
        { type: 'sectionDivider', attrs: { sectionId: 'sec-c1', sectionName: 'Sección 1' } },
        { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo C' }] },
      ],
    },
    contentHtml: '<p>cuerpo C</p>',
    seoMetadata: {},
    contentRules: {},
    reviewBaselineVersionId: null,
    reviewBaselineAt: null,
    reviewRequestedBy: null,
  });
}

function buildThreePageProjectResponse(overrides = {}) {
  return {
    project: {
      id: PROJECT_ID,
      name: 'P',
      projectType: 'page',
      companyId: 'co',
      ...(overrides.project ?? {}),
    },
    pages: overrides.pages ?? [buildPageA(), buildPageB(), buildPageC()],
  };
}

const GET_KEY = `GET ${BACKEND_BASE}/projects/${PROJECT_ID}`;
const PUT_KEY = `PUT ${BACKEND_BASE}/projects/${PROJECT_ID}/pages`;

// ══════════════════════════════════════════════════════════════════════════
// pages_delete
// ══════════════════════════════════════════════════════════════════════════

console.log('\npages_delete — inputSchema');

await test('rejects a non-uuid pageId', () => {
  const r = pagesDelete.inputSchema.safeParse({ projectId: PROJECT_ID, pageId: 'not-a-uuid' });
  assert.ok(!r.success);
});

await test('rejects missing projectId', () => {
  const r = pagesDelete.inputSchema.safeParse({ pageId: PAGE_A_ID });
  assert.ok(!r.success);
});

await test('accepts valid projectId + pageId', () => {
  const r = pagesDelete.inputSchema.safeParse({ projectId: PROJECT_ID, pageId: PAGE_A_ID });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

console.log('\npages_delete — handler happy path');

await test('deletes the middle page of 3, resends the other 2 verbatim with renumbered positions', async () => {
  const routes = {
    [GET_KEY]: { body: buildThreePageProjectResponse() },
    [PUT_KEY]: ({ body }) => ({
      body: {
        pages: body.pages.map((p) => ({ ...p, version: p.version + 1 })),
      },
    }),
  };

  await withMockedFetch(routes, async (calls) => {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID });

    assert.equal(r.status, 'ok');
    assert.equal(r.deletedPageId, PAGE_B_ID);
    assert.equal(r.deletedPageName, 'Servicios');
    assert.equal(r.pageCount, 2);
    assert.equal(r.projectId, PROJECT_ID);

    const putCall = calls.find((c) => c.method === 'PUT');
    assert.ok(putCall, 'expected a PUT call');
    assert.equal(putCall.body.source, 'mcp');
    assert.equal(putCall.body.pages.length, 2, 'exactly the 2 remaining pages');
    assert.ok(
      !putCall.body.pages.some((p) => p.id === PAGE_B_ID),
      'deleted page must not be in the PUT payload',
    );

    const sentA = putCall.body.pages.find((p) => p.id === PAGE_A_ID);
    const sentC = putCall.body.pages.find((p) => p.id === PAGE_C_ID);
    assert.ok(sentA && sentC, 'both remaining pages must be present');

    // positions renumbered 0..1
    assert.equal(sentA.position, 0);
    assert.equal(sentC.position, 1);

    // content/version/reviewBaseline* verbatim
    const origA = buildPageA();
    const origC = buildPageC();
    assert.equal(sentA.version, origA.version);
    assert.deepEqual(sentA.contentJson, origA.contentJson);
    assert.equal(sentA.contentHtml, origA.contentHtml);
    assert.deepEqual(sentA.seoMetadata, origA.seoMetadata);
    assert.deepEqual(sentA.contentRules, origA.contentRules);
    assert.equal(sentA.reviewStatus, origA.reviewStatus);
    assert.equal(sentA.reviewBaselineVersionId, origA.reviewBaselineVersionId);
    assert.equal(sentA.reviewBaselineAt, origA.reviewBaselineAt);
    assert.equal(sentA.reviewRequestedBy, origA.reviewRequestedBy);

    assert.equal(sentC.version, origC.version);
    assert.deepEqual(sentC.contentJson, origC.contentJson);
    assert.equal(sentC.contentHtml, origC.contentHtml);
    assert.equal(sentC.reviewBaselineVersionId, null);
    assert.equal(sentC.reviewBaselineAt, null);
    assert.equal(sentC.reviewRequestedBy, null);
  });
});

await test('page_not_found when pageId is not in the project (no PUT call)', async () => {
  const routes = { [GET_KEY]: { body: buildThreePageProjectResponse() } };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: OTHER_ID });
    assertStructuredError(r, 'page_not_found');
    assert.equal(calls.length, 1, 'only the GET call should have happened');
  });
});

await test('invalid_request when deleting the last remaining page (no PUT call)', async () => {
  const routes = {
    [GET_KEY]: { body: buildThreePageProjectResponse({ pages: [buildPageA()] }) },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: PAGE_A_ID });
    assertStructuredError(r, 'invalid_request');
    assert.equal(calls.length, 1, 'only the GET call should have happened');
  });
});

await test('rejects projectType=brief without ever calling PUT', async () => {
  const routes = {
    [GET_KEY]: { body: buildThreePageProjectResponse({ project: { projectType: 'brief' } }) },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID });
    assertStructuredError(r, 'invalid_project_type');
    assert.equal(calls.length, 1);
  });
});

await test('rejects an archived project', async () => {
  const routes = {
    [GET_KEY]: {
      body: buildThreePageProjectResponse({ project: { archivedAt: '2026-01-01T00:00:00Z' } }),
    },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID });
    assertStructuredError(r, 'project_not_mutable');
    assert.equal(calls.length, 1);
  });
});

console.log('\npages_delete — backend error mapping');

await test('PUT 403 -> structure_forbidden', async () => {
  const routes = {
    [GET_KEY]: { body: buildThreePageProjectResponse() },
    [PUT_KEY]: { ok: false, status: 403, body: { error: 'Tu rol no puede modificar la estructura' } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID });
    assertStructuredError(r, 'structure_forbidden');
    assert.equal(r.error.backendStatus, 403);
  });
});

await test('PUT 409 -> version_conflict', async () => {
  const routes = {
    [GET_KEY]: { body: buildThreePageProjectResponse() },
    [PUT_KEY]: { ok: false, status: 409, body: { error: 'conflict', pageId: PAGE_A_ID } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID });
    assertStructuredError(r, 'version_conflict');
    assert.equal(r.error.backendStatus, 409);
    assert.equal(r.error.affectedPageId, PAGE_A_ID);
  });
});

await test('GET 404 -> project_not_found', async () => {
  const routes = {
    [GET_KEY]: { ok: false, status: 404, body: { error: 'Proyecto no encontrado' } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID });
    assertStructuredError(r, 'project_not_found');
  });
});

console.log('\npages_delete — mcp_token_missing');

await test('returns mcp_token_missing when no token is configured', async () => {
  const savedToken = process.env.WEBRIEF_MCP_TOKEN;
  delete process.env.WEBRIEF_MCP_TOKEN;
  try {
    const r = await pagesDelete.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID });
    assertStructuredError(r, 'mcp_token_missing');
  } finally {
    if (savedToken !== undefined) process.env.WEBRIEF_MCP_TOKEN = savedToken;
  }
});

// ══════════════════════════════════════════════════════════════════════════
// pages_rename
// ══════════════════════════════════════════════════════════════════════════

console.log('\npages_rename — inputSchema');

await test('rejects an empty name', () => {
  const r = pagesRename.inputSchema.safeParse({
    projectId: PROJECT_ID,
    pageId: PAGE_A_ID,
    name: '',
  });
  assert.ok(!r.success);
});

await test('rejects a name over 120 chars', () => {
  const r = pagesRename.inputSchema.safeParse({
    projectId: PROJECT_ID,
    pageId: PAGE_A_ID,
    name: 'x'.repeat(121),
  });
  assert.ok(!r.success);
});

await test('accepts a valid rename input', () => {
  const r = pagesRename.inputSchema.safeParse({
    projectId: PROJECT_ID,
    pageId: PAGE_A_ID,
    name: 'Nuevo nombre',
  });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

console.log('\npages_rename — handler happy path');

await test('renames the 2nd of 3 pages; only its name changes in the PUT body', async () => {
  const routes = {
    [GET_KEY]: { body: buildThreePageProjectResponse() },
    [PUT_KEY]: ({ body }) => ({
      body: {
        pages: body.pages.map((p) => ({ ...p, version: p.version + 1 })),
      },
    }),
  };

  await withMockedFetch(routes, async (calls) => {
    const r = await pagesRename.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_B_ID,
      name: 'Nuestros Servicios',
    });

    assert.equal(r.status, 'ok');
    assert.equal(r.page.id, PAGE_B_ID);
    assert.equal(r.page.name, 'Nuestros Servicios');
    assert.equal(r.page.version, 6, 'echoed from PUT response (sent version 5 + 1 bump)');
    assert.equal(r.projectId, PROJECT_ID);

    const putCall = calls.find((c) => c.method === 'PUT');
    assert.ok(putCall);
    assert.equal(putCall.body.pages.length, 3);

    const sentA = putCall.body.pages.find((p) => p.id === PAGE_A_ID);
    const sentB = putCall.body.pages.find((p) => p.id === PAGE_B_ID);
    const sentC = putCall.body.pages.find((p) => p.id === PAGE_C_ID);

    // order preserved, positions 0..2
    assert.equal(putCall.body.pages[0].id, PAGE_A_ID);
    assert.equal(putCall.body.pages[1].id, PAGE_B_ID);
    assert.equal(putCall.body.pages[2].id, PAGE_C_ID);
    assert.equal(sentA.position, 0);
    assert.equal(sentB.position, 1);
    assert.equal(sentC.position, 2);

    // only the target's name changed
    assert.equal(sentB.name, 'Nuestros Servicios');
    assert.equal(sentA.name, 'Inicio');
    assert.equal(sentC.name, 'Contacto');

    // everything else about A and C verbatim
    const origA = buildPageA();
    const origC = buildPageC();
    assert.deepEqual(sentA.contentJson, origA.contentJson);
    assert.equal(sentA.version, origA.version);
    assert.deepEqual(sentC.contentJson, origC.contentJson);
    assert.equal(sentC.version, origC.version);

    // target's own content/version untouched, only name differs
    const origB = buildPageB();
    assert.deepEqual(sentB.contentJson, origB.contentJson);
    assert.equal(sentB.contentHtml, origB.contentHtml);
    assert.equal(sentB.version, origB.version);
    assert.equal(sentB.reviewStatus, origB.reviewStatus);

    // reviewBaseline* present for all pages
    assert.equal(sentA.reviewBaselineVersionId, origA.reviewBaselineVersionId);
    assert.equal(sentA.reviewBaselineAt, origA.reviewBaselineAt);
    assert.equal(sentA.reviewRequestedBy, origA.reviewRequestedBy);
    assert.equal(sentB.reviewBaselineVersionId, origB.reviewBaselineVersionId);
    assert.equal(sentB.reviewBaselineAt, origB.reviewBaselineAt);
    assert.equal(sentB.reviewRequestedBy, origB.reviewRequestedBy);
    assert.equal(sentC.reviewBaselineVersionId, null);
    assert.equal(sentC.reviewBaselineAt, null);
    assert.equal(sentC.reviewRequestedBy, null);
  });
});

await test('invalid_request when name is whitespace-only after trim (no PUT call)', async () => {
  const routes = { [GET_KEY]: { body: buildThreePageProjectResponse() } };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesRename.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID, name: '   ' });
    assertStructuredError(r, 'invalid_request');
    assert.equal(calls.length, 1, 'only the GET call should have happened');
  });
});

await test('page_not_found when pageId is not in the project', async () => {
  const routes = { [GET_KEY]: { body: buildThreePageProjectResponse() } };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesRename.handler({ projectId: PROJECT_ID, pageId: OTHER_ID, name: 'X' });
    assertStructuredError(r, 'page_not_found');
    assert.equal(calls.length, 1);
  });
});

await test('rejects projectType=brief without ever calling PUT', async () => {
  const routes = {
    [GET_KEY]: { body: buildThreePageProjectResponse({ project: { projectType: 'brief' } }) },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesRename.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID, name: 'X' });
    assertStructuredError(r, 'invalid_project_type');
    assert.equal(calls.length, 1);
  });
});

console.log('\npages_rename — backend error mapping');

await test('PUT 403 -> structure_forbidden', async () => {
  const routes = {
    [GET_KEY]: { body: buildThreePageProjectResponse() },
    [PUT_KEY]: { ok: false, status: 403, body: { error: 'Tu rol no puede modificar la estructura' } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesRename.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID, name: 'X' });
    assertStructuredError(r, 'structure_forbidden');
    assert.equal(r.error.backendStatus, 403);
  });
});

console.log('\npages_rename — mcp_token_missing');

await test('returns mcp_token_missing when no token is configured', async () => {
  const savedToken = process.env.WEBRIEF_MCP_TOKEN;
  delete process.env.WEBRIEF_MCP_TOKEN;
  try {
    const r = await pagesRename.handler({ projectId: PROJECT_ID, pageId: PAGE_B_ID, name: 'X' });
    assertStructuredError(r, 'mcp_token_missing');
  } finally {
    if (savedToken !== undefined) process.env.WEBRIEF_MCP_TOKEN = savedToken;
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Registration smoke test — every tool (incl. pages_delete / pages_rename)
// must register on a real McpServer without throwing.
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nMcpServer — registration smoke test');

await test('all exported tools register without throwing (20 tools incl. pages_delete/pages_rename)', async () => {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const tools = await import('../tools/index.js');
  const server = new McpServer(
    { name: 'webbrief-test', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );
  const names = [];
  for (const tool of Object.values(tools)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async () => ({ content: [] }),
    );
    names.push(tool.name);
  }
  assert.equal(names.length, 20, `expected 20 tools, got ${names.length}: ${names.join(', ')}`);
  assert.ok(names.includes('pages_delete'), 'missing pages_delete');
  assert.ok(names.includes('pages_rename'), 'missing pages_rename');
});

console.log(`\npages_manage.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
