/**
 * projects_list.test.js — Unit tests for the projects_list discovery tool.
 *
 * Covers:
 *   - inputSchema (optional companyId/projectType/search validation)
 *   - handler success paths (explicit companyId, active-company fallback,
 *     no-company global listing, projectType + search filters)
 *   - handler error paths (403 → company_not_found, 401 → backend_unauthorized,
 *     missing token → mcp_token_missing)
 *
 * Run with: node src/__tests__/projects_list.test.js
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
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-projects-list';
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

import * as projectsList from '../tools/projects_list.js';
import {
  setActiveCompanyId,
  _resetActiveCompanyForTests,
} from '../session/activeCompany.js';

const COMPANY_A = '11111111-1111-1111-1111-111111111111';
const COMPANY_B = '22222222-2222-2222-2222-222222222222';

const BACKEND_PROJECTS = [
  {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Landing Testimoniales',
    client: 'SoyPlenna',
    clientEmail: 'hola@soyplenna.com',
    companyId: COMPANY_A,
    companyName: 'WeBrief',
    businessType: 'general',
    projectType: 'document',
    lastActivity: '2026-07-01T10:00:00.000Z',
    hasChanges: false,
  },
  {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    name: 'Sitio corporativo',
    client: 'Acme',
    clientEmail: null,
    companyId: COMPANY_A,
    companyName: 'WeBrief',
    businessType: 'general',
    projectType: 'page',
    lastActivity: '2026-06-30T10:00:00.000Z',
    hasChanges: false,
  },
];

console.log('\nprojects_list — inputSchema');

await test('accepts empty input (all fields optional)', () => {
  assert.ok(projectsList.inputSchema.safeParse({}).success);
});
await test('rejects non-UUID companyId', () => {
  assert.ok(!projectsList.inputSchema.safeParse({ companyId: 'not-a-uuid' }).success);
});
await test('rejects invalid projectType', () => {
  assert.ok(!projectsList.inputSchema.safeParse({ projectType: 'website' }).success);
});
await test('rejects empty search string', () => {
  assert.ok(!projectsList.inputSchema.safeParse({ search: '' }).success);
});

console.log('\nprojects_list — handler');

await test('lists projects for an explicit companyId', async () => {
  _resetActiveCompanyForTests();
  const routes = {
    [`${BACKEND_BASE}/projects?companyId=${COMPANY_A}`]: { body: { projects: BACKEND_PROJECTS } },
  };
  await withMockedFetch(routes, async () => {
    const r = await projectsList.handler({ companyId: COMPANY_A });
    assert.equal(r.status, 'ok');
    assert.equal(r.companyId, COMPANY_A);
    assert.equal(r.total, 2);
    assert.equal(r.projects[0].id, BACKEND_PROJECTS[0].id);
    assert.equal(r.projects[0].clientName, 'SoyPlenna');
    assert.equal(r.projects[0].updatedAt, '2026-07-01T10:00:00.000Z');
    assert.equal(r.projects[0].companyName, 'WeBrief');
  });
});

await test('falls back to the active company when companyId is omitted', async () => {
  _resetActiveCompanyForTests();
  setActiveCompanyId(COMPANY_A);
  const routes = {
    [`${BACKEND_BASE}/projects?companyId=${COMPANY_A}`]: { body: { projects: BACKEND_PROJECTS } },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await projectsList.handler({});
    assert.equal(r.status, 'ok');
    assert.equal(r.companyId, COMPANY_A);
    assert.ok(calls[0].url.includes(`companyId=${COMPANY_A}`));
  });
  _resetActiveCompanyForTests();
});

await test('lists across all accessible companies when no company is pinned', async () => {
  _resetActiveCompanyForTests();
  const routes = {
    [`${BACKEND_BASE}/projects`]: { body: { projects: BACKEND_PROJECTS } },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await projectsList.handler({});
    assert.equal(r.status, 'ok');
    assert.equal(r.companyId, null);
    assert.equal(r.total, 2);
    assert.ok(!calls[0].url.includes('companyId='));
  });
});

await test('filters by projectType', async () => {
  _resetActiveCompanyForTests();
  const routes = {
    [`${BACKEND_BASE}/projects?companyId=${COMPANY_A}`]: { body: { projects: BACKEND_PROJECTS } },
  };
  await withMockedFetch(routes, async () => {
    const r = await projectsList.handler({ companyId: COMPANY_A, projectType: 'document' });
    assert.equal(r.total, 1);
    assert.equal(r.projects[0].projectType, 'document');
  });
});

await test('filters by search across name and clientName (case-insensitive)', async () => {
  _resetActiveCompanyForTests();
  const routes = {
    [`${BACKEND_BASE}/projects?companyId=${COMPANY_A}`]: { body: { projects: BACKEND_PROJECTS } },
  };
  await withMockedFetch(routes, async () => {
    const byName = await projectsList.handler({ companyId: COMPANY_A, search: 'testimoniales' });
    assert.equal(byName.total, 1);
    assert.equal(byName.projects[0].name, 'Landing Testimoniales');

    const byClient = await projectsList.handler({ companyId: COMPANY_A, search: 'PLENNA' });
    assert.equal(byClient.total, 1);
    assert.equal(byClient.projects[0].clientName, 'SoyPlenna');

    const noMatch = await projectsList.handler({ companyId: COMPANY_A, search: 'zzz' });
    assert.equal(noMatch.total, 0);
  });
});

await test('maps 403 with companyId to company_not_found (no existence leak)', async () => {
  _resetActiveCompanyForTests();
  const routes = {
    [`${BACKEND_BASE}/projects?companyId=${COMPANY_B}`]: {
      ok: false,
      status: 403,
      body: { error: 'No tienes acceso a esa empresa' },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await projectsList.handler({ companyId: COMPANY_B });
    assertStructuredError(r, 'company_not_found');
    assert.equal(r.error.backendStatus, 403);
  });
});

await test('maps 401 to backend_unauthorized', async () => {
  _resetActiveCompanyForTests();
  const routes = {
    [`${BACKEND_BASE}/projects`]: {
      ok: false,
      status: 401,
      body: { error: 'Token MCP invalido o revocado' },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await projectsList.handler({});
    assertStructuredError(r, 'backend_unauthorized');
  });
});

await test('maps backend 500 to backend_error', async () => {
  _resetActiveCompanyForTests();
  const routes = {
    [`${BACKEND_BASE}/projects`]: {
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      body: { error: 'boom' },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await projectsList.handler({});
    assertStructuredError(r, 'backend_error');
    assert.equal(r.error.backendStatus, 500);
  });
});

await test('returns mcp_token_missing when no token is configured', async () => {
  const savedToken = process.env.WEBRIEF_MCP_TOKEN;
  delete process.env.WEBRIEF_MCP_TOKEN;
  try {
    const r = await projectsList.handler({});
    assertStructuredError(r, 'mcp_token_missing');
  } finally {
    process.env.WEBRIEF_MCP_TOKEN = savedToken;
  }
});

console.log(`\nprojects_list.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
