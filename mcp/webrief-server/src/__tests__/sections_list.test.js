/**
 * sections_list.test.js — Unit tests for the sections_list structural-index tool.
 *
 * Covers:
 *   - inputSchema (required projectId/pageId UUID validation)
 *   - handler success paths (multi-section fixture, empty contentJson,
 *     null contentJson, sections with no sectionName / no headings)
 *   - handler error paths (page_not_found, 404 -> project_not_found,
 *     401/403 -> backend_unauthorized, 500 -> backend_error,
 *     missing token -> mcp_token_missing)
 *
 * Run with: node src/__tests__/sections_list.test.js
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
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-sections-list';
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

async function withMockedFetch(routes, fn) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const u = String(url);
    calls.push({ url: u, method: options?.method ?? 'GET', options });
    const key = `${options?.method ?? 'GET'} ${u}`;
    const spec = routes[key] ?? routes[u];
    if (!spec) throw new Error(`No mock configured for: ${key}`);
    return makeFetchResponse(spec);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

import * as sectionsList from '../tools/sections_list.js';

const PROJECT_ID = '33333333-3333-3333-3333-333333333333';
const PAGE_ID = '44444444-4444-4444-4444-444444444444';

// Fixture contentJson: 3 sections.
//   s1 "Intro"        — H2 "Bienvenido" + 1 paragraph
//   s2 "FAQ"          — H3 "¿Cómo funciona?" + 1 paragraph
//   s3 (name: null)   — 1 paragraph only (no heading)
const THREE_SECTION_DOC = {
  type: 'doc',
  content: [
    { type: 'sectionDivider', attrs: { sectionId: 's1', sectionName: 'Intro' } },
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Bienvenido' }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'Contenido introductorio de la página.' }] },
    { type: 'sectionDivider', attrs: { sectionId: 's2', sectionName: 'FAQ' } },
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: '¿Cómo funciona?' }],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'Explicación breve del funcionamiento.' }] },
    { type: 'sectionDivider', attrs: { sectionId: 's3', sectionName: null } },
    { type: 'paragraph', content: [{ type: 'text', text: 'Un párrafo sin encabezado asociado.' }] },
  ],
};

function projectRoute(projectId, page) {
  return {
    [`${BACKEND_BASE}/projects/${projectId}`]: {
      body: {
        project: { id: projectId, name: 'P', companyId: 'c', projectType: 'page' },
        pages: [page],
      },
    },
  };
}

console.log('\nsections_list — inputSchema');

await test('accepts valid { projectId, pageId }', () => {
  const result = sectionsList.inputSchema.safeParse({ projectId: PROJECT_ID, pageId: PAGE_ID });
  assert.ok(result.success);
});

await test('rejects missing projectId', () => {
  const result = sectionsList.inputSchema.safeParse({ pageId: PAGE_ID });
  assert.ok(!result.success);
});

await test('rejects missing pageId', () => {
  const result = sectionsList.inputSchema.safeParse({ projectId: PROJECT_ID });
  assert.ok(!result.success);
});

await test('rejects non-UUID projectId', () => {
  const result = sectionsList.inputSchema.safeParse({ projectId: 'not-a-uuid', pageId: PAGE_ID });
  assert.ok(!result.success);
});

await test('rejects non-UUID pageId', () => {
  const result = sectionsList.inputSchema.safeParse({ projectId: PROJECT_ID, pageId: 'not-a-uuid' });
  assert.ok(!result.success);
});

console.log('\nsections_list — handler success paths');

await test('returns the section index for a 3-section page', async () => {
  const page = {
    id: PAGE_ID,
    name: 'Home',
    version: 7,
    reviewStatus: 'approved',
    contentJson: THREE_SECTION_DOC,
  };
  const routes = projectRoute(PROJECT_ID, page);

  await withMockedFetch(routes, async () => {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });

    assert.equal(r.status, 'ok');
    assert.equal(r.tool, sectionsList.name);
    assert.equal(r.projectId, PROJECT_ID);
    assert.equal(r.pageId, PAGE_ID);
    assert.equal(r.pageName, 'Home');
    assert.equal(r.version, 7);
    assert.equal(r.reviewStatus, 'approved');
    assert.equal(r.total, 3);

    assert.deepEqual(r.sections, [
      {
        sectionId: 's1',
        sectionName: 'Intro',
        position: 0,
        headings: [{ level: 2, text: 'Bienvenido' }],
        blockCount: 2,
      },
      {
        sectionId: 's2',
        sectionName: 'FAQ',
        position: 1,
        headings: [{ level: 3, text: '¿Cómo funciona?' }],
        blockCount: 2,
      },
      {
        sectionId: 's3',
        sectionName: null,
        position: 2,
        headings: [],
        blockCount: 1,
      },
    ]);
  });
});

await test('returns empty sections for an empty contentJson doc', async () => {
  const page = {
    id: PAGE_ID,
    name: 'Empty page',
    version: 1,
    reviewStatus: 'draft',
    contentJson: { type: 'doc', content: [] },
  };
  const routes = projectRoute(PROJECT_ID, page);

  await withMockedFetch(routes, async () => {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.sections, []);
    assert.equal(r.total, 0);
  });
});

await test('returns empty sections when contentJson is null', async () => {
  const page = {
    id: PAGE_ID,
    name: 'No content yet',
    version: 1,
    reviewStatus: 'draft',
    contentJson: null,
  };
  const routes = projectRoute(PROJECT_ID, page);

  await withMockedFetch(routes, async () => {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });
    assert.equal(r.status, 'ok');
    assert.deepEqual(r.sections, []);
    assert.equal(r.total, 0);
  });
});

console.log('\nsections_list — handler error paths');

await test('returns page_not_found when pageId is absent from project', async () => {
  const MISSING_PAGE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const routes = projectRoute(PROJECT_ID, {
    id: PAGE_ID,
    name: 'Home',
    version: 1,
    reviewStatus: 'draft',
    contentJson: { type: 'doc', content: [] },
  });

  await withMockedFetch(routes, async () => {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: MISSING_PAGE_ID });
    assertStructuredError(r, 'page_not_found');
  });
});

await test('maps backend 404 to project_not_found', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      ok: false,
      status: 404,
      body: { error: 'Proyecto no encontrado' },
    },
  };

  await withMockedFetch(routes, async () => {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });
    assertStructuredError(r, 'project_not_found');
    assert.equal(r.error.backendStatus, 404);
  });
});

await test('maps backend 401 to backend_unauthorized', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      ok: false,
      status: 401,
      body: { error: 'Token MCP invalido o revocado' },
    },
  };

  await withMockedFetch(routes, async () => {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });
    assertStructuredError(r, 'backend_unauthorized');
  });
});

await test('maps backend 403 to backend_unauthorized', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      ok: false,
      status: 403,
      body: { error: 'No tienes acceso a este proyecto' },
    },
  };

  await withMockedFetch(routes, async () => {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });
    assertStructuredError(r, 'backend_unauthorized');
  });
});

await test('maps backend 500 to backend_error with backendStatus', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      body: { error: 'boom' },
    },
  };

  await withMockedFetch(routes, async () => {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });
    assertStructuredError(r, 'backend_error');
    assert.equal(r.error.backendStatus, 500);
  });
});

await test('returns mcp_token_missing when no token is configured', async () => {
  const savedToken = process.env.WEBRIEF_MCP_TOKEN;
  delete process.env.WEBRIEF_MCP_TOKEN;
  try {
    const r = await sectionsList.handler({ projectId: PROJECT_ID, pageId: PAGE_ID });
    assertStructuredError(r, 'mcp_token_missing');
  } finally {
    process.env.WEBRIEF_MCP_TOKEN = savedToken;
  }
});

console.log(`\nsections_list.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
