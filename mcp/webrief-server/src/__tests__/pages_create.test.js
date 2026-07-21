/**
 * pages_create.test.js — Unit tests for the pages_create MCP tool.
 *
 * Covers:
 *   - inputSchema (minimal + full input acceptance, rejections: empty/long
 *     name, negative position, >20 sections, paragraph >5000 chars)
 *   - handler happy path (default empty-section page): GET project + PUT
 *     pages full-replace payload, ordering, contentJson/contentHtml shape
 *   - handler with initial sections: heading/paragraph structure built
 *     from the sections[] input
 *   - position handling: omitted (append), 0 (prepend), out-of-range (clamp)
 *   - invalid_project_type (brief) refused before any PUT
 *   - project_not_mutable (archived / trashed)
 *   - backend error mapping: 404 -> project_not_found, PUT 403 ->
 *     structure_forbidden, PUT 409 -> version_conflict, PUT 400 ->
 *     invalid_request, PUT 500 / network failure -> backend_error
 *   - mcp_token_missing
 *   - McpServer registration smoke test (18 tools, including pages_create)
 *
 * Run with: node src/__tests__/pages_create.test.js
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
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-pages-create';
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

// Same shape as assets_tools.test.js / fase3.test.js's withMockedFetch, with
// one addition: a route value may be a function `({ body, calls }) => spec`
// so tests can build a response from the actual PUT payload — needed here
// because pages_create.js generates the new page's id internally via
// crypto.randomUUID(), so the test can't know it ahead of time. A route
// value may also be `{ networkError: true }` to simulate fetch() itself
// rejecting (no HTTP response at all, e.g. connection failure).
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

import * as pagesCreate from '../tools/pages_create.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PAGE_A_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PAGE_B_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildExistingPageA() {
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
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hola' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo A' }] },
      ],
    },
    contentHtml: '<p>old html A</p>',
    seoMetadata: { titleTag: 'Inicio SEO' },
    contentRules: { locked: false },
  };
}

function buildExistingPageB() {
  return {
    id: PAGE_B_ID,
    name: 'Contacto',
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
    seoMetadata: { urlSlug: 'contacto' },
    contentRules: {},
  };
}

function buildPageProjectResponse(overrides = {}) {
  return {
    project: {
      id: PROJECT_ID,
      name: 'P',
      projectType: 'page',
      companyId: 'co',
      ...(overrides.project ?? {}),
    },
    pages: overrides.pages ?? [buildExistingPageA(), buildExistingPageB()],
  };
}

const GET_KEY = `GET ${BACKEND_BASE}/projects/${PROJECT_ID}`;
const PUT_KEY = `PUT ${BACKEND_BASE}/projects/${PROJECT_ID}/pages`;

// ──────────────────────────────────────────────────────────────────────────────
// inputSchema
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — inputSchema');

await test('accepts minimal input (projectId + name only)', () => {
  const r = pagesCreate.inputSchema.safeParse({ projectId: PROJECT_ID, name: 'Nueva página' });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

await test('accepts full input (position + sections with all fields)', () => {
  const r = pagesCreate.inputSchema.safeParse({
    projectId: PROJECT_ID,
    name: 'Nueva página',
    position: 1,
    sections: [
      {
        name: 'Intro',
        headingLevel: 2,
        headingText: 'Bienvenida',
        paragraphs: ['Primer párrafo.', 'Segundo párrafo.'],
      },
    ],
  });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

await test('rejects empty name and name over 120 chars', () => {
  assert.ok(!pagesCreate.inputSchema.safeParse({ projectId: PROJECT_ID, name: '' }).success);
  assert.ok(
    !pagesCreate.inputSchema.safeParse({
      projectId: PROJECT_ID,
      name: 'x'.repeat(121),
    }).success,
  );
});

await test('rejects negative position', () => {
  const r = pagesCreate.inputSchema.safeParse({
    projectId: PROJECT_ID,
    name: 'p',
    position: -1,
  });
  assert.ok(!r.success);
});

await test('rejects more than 20 sections', () => {
  const sections = Array.from({ length: 21 }, () => ({ paragraphs: ['x'] }));
  const r = pagesCreate.inputSchema.safeParse({ projectId: PROJECT_ID, name: 'p', sections });
  assert.ok(!r.success);
});

await test('rejects a paragraph over 5000 chars', () => {
  const r = pagesCreate.inputSchema.safeParse({
    projectId: PROJECT_ID,
    name: 'p',
    sections: [{ paragraphs: ['x'.repeat(5001)] }],
  });
  assert.ok(!r.success);
});

// ──────────────────────────────────────────────────────────────────────────────
// Handler — happy path (default empty section)
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — handler happy path (default page)');

await test('creates a page with a single default empty section, appended at the end', async () => {
  const routes = {
    [GET_KEY]: { body: buildPageProjectResponse() },
    [PUT_KEY]: ({ body }) => ({
      body: {
        pages: body.pages.map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          version: p.version + 1, // simulate backend save bump
          reviewStatus: p.reviewStatus,
        })),
      },
    }),
  };

  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva página' });

    // (1) status ok + page.id/name/position/version + pageCount
    assert.equal(r.status, 'ok');
    assert.match(r.page.id, UUID_RE);
    assert.equal(r.page.name, 'Nueva página');
    assert.equal(r.page.position, 2, 'appended after the 2 existing pages');
    assert.equal(r.page.version, 2, 'echoed from the PUT response (sent version 1 + 1 bump)');
    assert.equal(r.pageCount, 3);
    assert.equal(r.projectId, PROJECT_ID);

    // (2) PUT body carries all 3 pages; the 2 existing ones intact
    const putCall = calls.find((c) => c.method === 'PUT');
    assert.ok(putCall, 'expected a PUT call');
    assert.equal(putCall.body.source, 'mcp');
    assert.equal(putCall.body.pages.length, 3);
    const existingA = putCall.body.pages.find((p) => p.id === PAGE_A_ID);
    const existingB = putCall.body.pages.find((p) => p.id === PAGE_B_ID);
    assert.ok(existingA && existingB, 'both existing pages must be present verbatim');
    assert.equal(existingA.version, 3);
    assert.deepEqual(existingA.contentJson, buildExistingPageA().contentJson);
    assert.equal(existingA.contentHtml, '<p>old html A</p>');
    assert.equal(existingB.version, 5);
    assert.deepEqual(existingB.contentJson, buildExistingPageB().contentJson);

    // (3) new page has valid contentJson with a sectionDivider first, non-empty contentHtml
    const newPage = putCall.body.pages.find(
      (p) => p.id !== PAGE_A_ID && p.id !== PAGE_B_ID,
    );
    assert.ok(newPage, 'new page must be present in the PUT payload');
    assert.equal(newPage.name, 'Nueva página');
    assert.equal(newPage.contentJson.type, 'doc');
    assert.equal(newPage.contentJson.content[0].type, 'sectionDivider');
    assert.ok(newPage.contentHtml && newPage.contentHtml.length > 0);

    // (4) order reflects the requested (default: end) position
    assert.equal(putCall.body.pages[0].id, PAGE_A_ID);
    assert.equal(putCall.body.pages[1].id, PAGE_B_ID);
    assert.equal(putCall.body.pages[2].id, newPage.id);
    assert.equal(putCall.body.pages[0].position, 0);
    assert.equal(putCall.body.pages[1].position, 1);
    assert.equal(putCall.body.pages[2].position, 2);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Handler — with initial sections
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — handler with initial sections');

await test('builds contentJson from sections[] (named section w/ heading+paragraphs, then auto-named section)', async () => {
  const routes = {
    [GET_KEY]: { body: buildPageProjectResponse() },
    [PUT_KEY]: { body: { pages: [] } }, // savedPage lookup misses -> defaults used, fine for this test
  };

  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({
      projectId: PROJECT_ID,
      name: 'Landing',
      sections: [
        {
          name: 'Intro',
          headingLevel: 2,
          headingText: 'Bienvenida',
          paragraphs: ['Primer párrafo.', 'Segundo párrafo.'],
        },
        { paragraphs: ['Solo texto.'] },
      ],
    });
    assert.equal(r.status, 'ok');

    const putCall = calls.find((c) => c.method === 'PUT');
    const newPage = putCall.body.pages.find((p) => p.name === 'Landing');
    assert.ok(newPage);
    const content = newPage.contentJson.content;

    assert.equal(content[0].type, 'sectionDivider');
    assert.equal(content[0].attrs.sectionName, 'Intro');
    assert.equal(content[1].type, 'heading');
    assert.equal(content[1].attrs.level, 2);
    assert.equal(content[1].content[0].text, 'Bienvenida');
    assert.equal(content[2].type, 'paragraph');
    assert.equal(content[2].content[0].text, 'Primer párrafo.');
    assert.equal(content[3].type, 'paragraph');
    assert.equal(content[3].content[0].text, 'Segundo párrafo.');

    assert.equal(content[4].type, 'sectionDivider');
    assert.equal(content[4].attrs.sectionName, 'Sección 2', 'auto-named 2nd section, no heading given');
    assert.equal(content[5].type, 'paragraph');
    assert.equal(content[5].content[0].text, 'Solo texto.');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// position handling
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — position handling');

await test('position omitted appends the new page at the end', async () => {
  const routes = { [GET_KEY]: { body: buildPageProjectResponse() }, [PUT_KEY]: { body: { pages: [] } } };
  await withMockedFetch(routes, async (calls) => {
    await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    const putCall = calls.find((c) => c.method === 'PUT');
    assert.deepEqual(
      putCall.body.pages.map((p) => p.name),
      ['Inicio', 'Contacto', 'Nueva'],
    );
  });
});

await test('position 0 inserts the new page first', async () => {
  const routes = { [GET_KEY]: { body: buildPageProjectResponse() }, [PUT_KEY]: { body: { pages: [] } } };
  await withMockedFetch(routes, async (calls) => {
    await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva', position: 0 });
    const putCall = calls.find((c) => c.method === 'PUT');
    assert.deepEqual(
      putCall.body.pages.map((p) => p.name),
      ['Nueva', 'Inicio', 'Contacto'],
    );
    assert.deepEqual(putCall.body.pages.map((p) => p.position), [0, 1, 2]);
  });
});

await test('out-of-range position clamps to the end', async () => {
  const routes = { [GET_KEY]: { body: buildPageProjectResponse() }, [PUT_KEY]: { body: { pages: [] } } };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva', position: 999 });
    assert.equal(r.status, 'ok');
    assert.equal(r.page.position, 2);
    const putCall = calls.find((c) => c.method === 'PUT');
    assert.deepEqual(
      putCall.body.pages.map((p) => p.name),
      ['Inicio', 'Contacto', 'Nueva'],
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// invalid_project_type (brief)
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — invalid_project_type');

await test('rejects projectType=brief without ever calling PUT', async () => {
  const routes = {
    [GET_KEY]: { body: buildPageProjectResponse({ project: { projectType: 'brief' } }) },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'invalid_project_type');
    assert.equal(calls.length, 1, 'only the GET call should have happened');
    assert.equal(calls[0].method, 'GET');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// project_not_mutable (archived / trashed)
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — project_not_mutable');

await test('rejects an archived project', async () => {
  const routes = {
    [GET_KEY]: {
      body: buildPageProjectResponse({ project: { archivedAt: '2026-01-01T00:00:00Z' } }),
    },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'project_not_mutable');
    assert.equal(calls.length, 1);
  });
});

await test('rejects a trashed project', async () => {
  const routes = {
    [GET_KEY]: {
      body: buildPageProjectResponse({ project: { trashedAt: '2026-01-01T00:00:00Z' } }),
    },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'project_not_mutable');
    assert.equal(calls.length, 1);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Backend error mapping
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — backend error mapping');

await test('GET 404 -> project_not_found', async () => {
  const routes = {
    [GET_KEY]: { ok: false, status: 404, body: { error: 'Proyecto no encontrado' } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'project_not_found');
  });
});

await test('PUT 403 -> structure_forbidden', async () => {
  const routes = {
    [GET_KEY]: { body: buildPageProjectResponse() },
    [PUT_KEY]: { ok: false, status: 403, body: { error: 'Tu rol no puede modificar la estructura' } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'structure_forbidden');
    assert.equal(r.error.backendStatus, 403);
  });
});

await test('PUT 409 -> version_conflict', async () => {
  const routes = {
    [GET_KEY]: { body: buildPageProjectResponse() },
    [PUT_KEY]: { ok: false, status: 409, body: { error: 'conflict', pageId: PAGE_A_ID } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'version_conflict');
    assert.equal(r.error.backendStatus, 409);
    assert.equal(r.error.affectedPageId, PAGE_A_ID);
  });
});

await test('PUT 400 -> invalid_request with backend message', async () => {
  const routes = {
    [GET_KEY]: { body: buildPageProjectResponse() },
    [PUT_KEY]: { ok: false, status: 400, body: { error: 'Payload de páginas inválido' } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'invalid_request');
    assert.ok(r.error.message.includes('inválido'));
    assert.equal(r.error.backendStatus, 400);
  });
});

await test('PUT 500 -> backend_error', async () => {
  const routes = {
    [GET_KEY]: { body: buildPageProjectResponse() },
    [PUT_KEY]: { ok: false, status: 500, body: { error: 'Internal error' } },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'backend_error');
    assert.equal(r.error.backendStatus, 500);
  });
});

await test('network failure on PUT -> backend_error with no backendStatus', async () => {
  const routes = {
    [GET_KEY]: { body: buildPageProjectResponse() },
    [PUT_KEY]: { networkError: true },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'backend_error');
    assert.equal(r.error.backendStatus, null);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// mcp_token_missing
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — mcp_token_missing');

await test('returns mcp_token_missing when no token is configured', async () => {
  const savedToken = process.env.WEBRIEF_MCP_TOKEN;
  delete process.env.WEBRIEF_MCP_TOKEN;
  try {
    const r = await pagesCreate.handler({ projectId: PROJECT_ID, name: 'Nueva' });
    assertStructuredError(r, 'mcp_token_missing');
  } finally {
    if (savedToken !== undefined) process.env.WEBRIEF_MCP_TOKEN = savedToken;
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Registration smoke test — every tool (incl. pages_create) must register on a
// real McpServer without throwing (catches non-ZodObject inputSchema exports).
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nMcpServer — registration smoke test');

await test('all exported tools register without throwing (18 tools incl. pages_create)', async () => {
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
  assert.equal(names.length, 18, `expected 18 tools, got ${names.length}: ${names.join(', ')}`);
  assert.ok(names.includes('pages_create'), 'missing pages_create');
});

console.log(`\npages_create.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
