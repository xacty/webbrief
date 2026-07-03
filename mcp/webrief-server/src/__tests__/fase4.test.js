/**
 * fase4.test.js — Tests for project metadata update tools.
 *
 *   - tools/projects.previewUpdate.js
 *   - tools/projects.applyUpdate.js
 *
 * These wrap the extended PATCH /projects/:id backend endpoint (which now
 * accepts name, clientName, clientEmail, businessType, projectType).
 *
 * Run with: node src/__tests__/fase4.test.js
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
  assert.equal(result.error?.code, code, `error.code should be '${code}'`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Mocked fetch
// ──────────────────────────────────────────────────────────────────────────────

const BACKEND_BASE = 'http://localhost:3000/api';
process.env.WEBRIEF_MCP_TOKEN = 'test-fixture-not-a-real-token-fase4';

function makeResp({ ok = true, status = 200, body = null }) {
  return {
    ok,
    status,
    statusText: 'OK',
    async json() {
      return body;
    },
  };
}

async function withMockedFetch(routes, fn) {
  const orig = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const u = String(url);
    const method = options?.method ?? 'GET';
    calls.push({ url: u, method, options });
    const spec = routes[`${method} ${u}`] ?? routes[u];
    if (!spec) throw new Error(`No mock configured for: ${method} ${u}`);
    return makeResp(spec);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = orig;
  }
}

import * as previewUpdate from '../tools/projects_previewUpdate.js';
import * as applyUpdate from '../tools/projects_applyUpdate.js';
import { _resetPreviewStoreForTests, savePreview } from '../lib/previewStore.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function buildProjectGet(overrides = {}) {
  return {
    project: {
      id: PROJECT_ID,
      name: 'Original',
      projectType: 'page',
      companyId: 'co',
      clientName: 'Old client',
      clientEmail: 'old@example.com',
      businessType: 'tabula_rasa',
      archivedAt: null,
      trashedAt: null,
      ...overrides,
    },
    pages: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// projects.previewUpdate — schema
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nprojects.previewUpdate — schema');

await test('rejects empty changes object', () => {
  const r = previewUpdate.inputSchema.safeParse({ projectId: PROJECT_ID, changes: {} });
  assert.ok(!r.success);
});

await test('rejects unknown fields in changes (strict)', () => {
  const r = previewUpdate.inputSchema.safeParse({
    projectId: PROJECT_ID,
    changes: { unknownField: 'x' },
  });
  assert.ok(!r.success);
});

await test('rejects projectType not in enum', () => {
  const r = previewUpdate.inputSchema.safeParse({
    projectId: PROJECT_ID,
    changes: { projectType: 'website' },
  });
  assert.ok(!r.success);
});

await test('accepts every supported field', () => {
  const r = previewUpdate.inputSchema.safeParse({
    projectId: PROJECT_ID,
    changes: {
      name: 'New',
      clientName: 'New client',
      clientEmail: 'new@x.com',
      businessType: 'general',
      projectType: 'document',
    },
  });
  assert.ok(r.success);
});

// ─────────────────────────────────────────────────────────────────────────────
// projects.previewUpdate — handler
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nprojects.previewUpdate — handler');

await test('returns per-field diff and saves preview', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`GET ${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: buildProjectGet() },
  };
  await withMockedFetch(routes, async () => {
    const r = await previewUpdate.handler({
      projectId: PROJECT_ID,
      changes: { name: 'New name', clientName: 'New client' },
    });
    assert.equal(r.status, 'ok');
    assert.ok(r.previewId.startsWith('prev_'));
    assert.deepEqual(r.diff.name, { before: 'Original', after: 'New name' });
    assert.deepEqual(r.diff.clientName, { before: 'Old client', after: 'New client' });
    // Untouched fields are not in the diff.
    assert.equal(r.diff.clientEmail, undefined);
  });
});

await test('drops fields that already match (no-op)', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`GET ${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: buildProjectGet() },
  };
  await withMockedFetch(routes, async () => {
    const r = await previewUpdate.handler({
      projectId: PROJECT_ID,
      changes: { name: 'Original' }, // already the current value
    });
    assert.equal(r.status, 'ok');
    assert.equal(r.noop, true);
    assert.equal(r.previewId, null);
  });
});

await test('archived project rejected as project_not_mutable', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`GET ${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: buildProjectGet({ archivedAt: '2026-01-01T00:00:00Z' }),
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await previewUpdate.handler({
      projectId: PROJECT_ID,
      changes: { name: 'X' },
    });
    assertStructuredError(r, 'project_not_mutable');
  });
});

await test('trashed project rejected as project_not_mutable', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`GET ${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: buildProjectGet({ trashedAt: '2026-01-01T00:00:00Z' }),
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await previewUpdate.handler({
      projectId: PROJECT_ID,
      changes: { name: 'X' },
    });
    assertStructuredError(r, 'project_not_mutable');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// projects.applyUpdate — handler
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nprojects.applyUpdate — handler');

await test('full preview→apply flow PATCHes only the changed fields', async () => {
  _resetPreviewStoreForTests();
  let previewId;
  await withMockedFetch(
    { [`GET ${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: buildProjectGet() } },
    async () => {
      const r = await previewUpdate.handler({
        projectId: PROJECT_ID,
        changes: { name: 'Renamed', businessType: 'general' },
      });
      previewId = r.previewId;
    },
  );

  const patchRoutes = {
    [`PATCH ${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: {
          id: PROJECT_ID,
          name: 'Renamed',
          projectType: 'page',
          companyId: 'co',
          clientName: 'Old client',
          clientEmail: 'old@example.com',
          businessType: 'general',
          updatedAt: '2026-05-22T20:00:00Z',
        },
      },
    },
  };

  await withMockedFetch(patchRoutes, async (calls) => {
    const r = await applyUpdate.handler({ projectId: PROJECT_ID, previewId });
    assert.equal(r.status, 'ok');
    assert.equal(r.project.name, 'Renamed');
    assert.equal(r.project.businessType, 'general');

    const patchCall = calls.find((c) => c.method === 'PATCH');
    const body = JSON.parse(patchCall.options.body);
    // Only the two diffed fields should be in the PATCH payload.
    assert.deepEqual(Object.keys(body).sort(), ['businessType', 'name'].sort());
    assert.equal(body.name, 'Renamed');
    assert.equal(body.businessType, 'general');
  });

  // Second apply must fail — preview was burned.
  const second = await applyUpdate.handler({ projectId: PROJECT_ID, previewId });
  assertStructuredError(second, 'preview_not_found');
});

await test('rejects wrong-kind previewId', async () => {
  _resetPreviewStoreForTests();
  const { previewId } = savePreview('create_project', { projectId: PROJECT_ID });
  const r = await applyUpdate.handler({ projectId: PROJECT_ID, previewId });
  assertStructuredError(r, 'preview_kind_mismatch');
});

await test('rejects mismatched projectId', async () => {
  _resetPreviewStoreForTests();
  const { previewId } = savePreview('update_project', {
    projectId: PROJECT_ID,
    changes: { name: 'X' },
    before: {},
  });
  const r = await applyUpdate.handler({ projectId: OTHER_ID, previewId });
  assertStructuredError(r, 'preview_project_mismatch');
});

await test('returns preview_not_found for unknown previewId', async () => {
  _resetPreviewStoreForTests();
  const r = await applyUpdate.handler({ projectId: PROJECT_ID, previewId: 'prev_nope' });
  assertStructuredError(r, 'preview_not_found');
});

// ─────────────────────────────────────────────────────────────────────────────
// mcp_token_missing
// ─────────────────────────────────────────────────────────────────────────────

console.log('\nFase 4 handlers — mcp_token_missing');

const savedTok = process.env.WEBRIEF_MCP_TOKEN;
delete process.env.WEBRIEF_MCP_TOKEN;

await test('projects.previewUpdate returns mcp_token_missing', async () => {
  const r = await previewUpdate.handler({
    projectId: PROJECT_ID,
    changes: { name: 'x' },
  });
  assertStructuredError(r, 'mcp_token_missing');
});

await test('projects.applyUpdate returns mcp_token_missing', async () => {
  const r = await applyUpdate.handler({ projectId: PROJECT_ID, previewId: 'prev_x' });
  assertStructuredError(r, 'mcp_token_missing');
});

if (savedTok !== undefined) process.env.WEBRIEF_MCP_TOKEN = savedTok;

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
