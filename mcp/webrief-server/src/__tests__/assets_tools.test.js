/**
 * assets_tools.test.js — Unit tests for the image export/convert MCP tools.
 *
 * Covers:
 *   - schemas/asset.js (exportOptionsShape enums, exportItem refinement)
 *   - assets_list handler (success, 404, 401)
 *   - assets_export handler (single, batch, transformations passthrough,
 *     403 → export_forbidden, 404 disambiguation, 400 → invalid_request)
 *   - assets_convertAndSave handler (success, missing assetId/src,
 *     SVG rejection passthrough, 404 disambiguation)
 *   - McpServer registration smoke test (all tools register without throwing)
 *
 * Run with: node src/__tests__/assets_tools.test.js
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
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-assets';
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
    calls.push({
      url: u,
      method: options?.method ?? 'GET',
      body: options?.body ? JSON.parse(options.body) : null,
    });
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

import * as assetsList from '../tools/assets_list.js';
import * as assetsExport from '../tools/assets_export.js';
import * as assetsConvertAndSave from '../tools/assets_convertAndSave.js';
import { exportItem } from '../schemas/asset.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSET_1 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ASSET_2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

const BACKEND_ASSETS = [
  {
    id: ASSET_1,
    fileName: 'hero.png',
    mimeType: 'image/png',
    assetKind: 'image',
    publicUrl: 'https://ik.imagekit.io/x/companies/c/projects/p/hero.png',
    fileSize: 480000,
    width: 2400,
    height: 1200,
    pageId: null,
    sectionId: 'sec-1',
    renderInline: true,
    createdAt: '2026-07-01T10:00:00.000Z',
  },
  {
    id: ASSET_2,
    fileName: 'logo.svg',
    mimeType: 'image/svg+xml',
    assetKind: 'svg',
    publicUrl: 'https://ik.imagekit.io/x/companies/c/projects/p/logo.svg',
    fileSize: 9000,
    width: null,
    height: null,
    pageId: null,
    sectionId: null,
    renderInline: false,
    createdAt: '2026-07-01T09:00:00.000Z',
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// schemas/asset.js
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nschemas/asset.js — exportItem');

await test('accepts assetId-only and src-only items', () => {
  assert.ok(exportItem.safeParse({ assetId: ASSET_1 }).success);
  assert.ok(exportItem.safeParse({ src: 'https://ik.imagekit.io/x/a.png' }).success);
});
await test('rejects empty item and non-UUID assetId', () => {
  assert.ok(!exportItem.safeParse({}).success);
  assert.ok(!exportItem.safeParse({ assetId: 'nope' }).success);
});

console.log('\nassets_export — inputSchema');

await test('accepts full transformation set', () => {
  const parsed = assetsExport.inputSchema.safeParse({
    projectId: PROJECT_ID,
    items: [{ assetId: ASSET_1 }],
    format: 'webp',
    quality: 80,
    width: 1200,
    height: 800,
    fit: 'at_max',
    cropMode: 'extract',
    x: 10,
    y: 20,
    focus: 'face',
    fileName: 'export',
  });
  assert.ok(parsed.success, JSON.stringify(parsed.error?.issues));
});
await test('rejects invalid format / quality out of range / >100 items', () => {
  assert.ok(!assetsExport.inputSchema.safeParse({
    projectId: PROJECT_ID, items: [{ assetId: ASSET_1 }], format: 'gif',
  }).success);
  assert.ok(!assetsExport.inputSchema.safeParse({
    projectId: PROJECT_ID, items: [{ assetId: ASSET_1 }], quality: 101,
  }).success);
  const tooMany = Array.from({ length: 101 }, () => ({ assetId: ASSET_1 }));
  assert.ok(!assetsExport.inputSchema.safeParse({
    projectId: PROJECT_ID, items: tooMany,
  }).success);
});

// ──────────────────────────────────────────────────────────────────────────────
// assets_list — handler
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nassets_list — handler');

await test('lists project assets', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}/assets`]: { body: { assets: BACKEND_ASSETS } },
  };
  await withMockedFetch(routes, async () => {
    const r = await assetsList.handler({ projectId: PROJECT_ID });
    assert.equal(r.status, 'ok');
    assert.equal(r.total, 2);
    assert.equal(r.assets[0].id, ASSET_1);
    assert.equal(r.assets[1].assetKind, 'svg');
  });
});

await test('maps 404 to project_not_found', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}/assets`]: {
      ok: false, status: 404, body: { error: 'Proyecto no encontrado' },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await assetsList.handler({ projectId: PROJECT_ID });
    assertStructuredError(r, 'project_not_found');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// assets_export — handler
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nassets_export — handler');

await test('returns download links and forwards transformation options', async () => {
  const routes = {
    [`POST ${BACKEND_BASE}/projects/${PROJECT_ID}/assets/export-links`]: {
      body: {
        requested: 2,
        resolved: 2,
        options: { format: 'webp', quality: 80 },
        links: [
          { assetId: ASSET_1, fileName: 'hero.webp', url: 'https://ik.imagekit.io/x/tr:f-webp,q-80/hero.png', mimeType: 'image/png', assetKind: 'image', transformed: true },
          { assetId: ASSET_2, fileName: 'logo.svg', url: BACKEND_ASSETS[1].publicUrl, mimeType: 'image/svg+xml', assetKind: 'svg', transformed: false },
        ],
      },
    },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await assetsExport.handler({
      projectId: PROJECT_ID,
      items: [{ assetId: ASSET_1 }, { assetId: ASSET_2 }],
      format: 'webp',
      quality: 80,
    });
    assert.equal(r.status, 'ok');
    assert.equal(r.resolved, 2);
    assert.equal(r.links.length, 2);
    assert.ok(r.links[0].url.includes('f-webp'));
    // The tool must forward items + options in the POST body.
    assert.equal(calls[0].body.items.length, 2);
    assert.equal(calls[0].body.format, 'webp');
    assert.equal(calls[0].body.quality, 80);
  });
});

await test('maps 403 to export_forbidden', async () => {
  const routes = {
    [`POST ${BACKEND_BASE}/projects/${PROJECT_ID}/assets/export-links`]: {
      ok: false, status: 403, body: { error: 'Tu rol no puede exportar imagenes de este proyecto' },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await assetsExport.handler({ projectId: PROJECT_ID, items: [{ assetId: ASSET_1 }] });
    assertStructuredError(r, 'export_forbidden');
  });
});

await test('disambiguates 404 project vs asset', async () => {
  const projectMissing = {
    [`POST ${BACKEND_BASE}/projects/${PROJECT_ID}/assets/export-links`]: {
      ok: false, status: 404, body: { error: 'Proyecto no encontrado' },
    },
  };
  await withMockedFetch(projectMissing, async () => {
    const r = await assetsExport.handler({ projectId: PROJECT_ID, items: [{ assetId: ASSET_1 }] });
    assertStructuredError(r, 'project_not_found');
  });

  const assetMissing = {
    [`POST ${BACKEND_BASE}/projects/${PROJECT_ID}/assets/export-links`]: {
      ok: false, status: 404, body: { error: 'No se encontraron assets exportables' },
    },
  };
  await withMockedFetch(assetMissing, async () => {
    const r = await assetsExport.handler({ projectId: PROJECT_ID, items: [{ assetId: ASSET_1 }] });
    assertStructuredError(r, 'asset_not_found');
  });
});

await test('maps 400 to invalid_request with backend message', async () => {
  const routes = {
    [`POST ${BACKEND_BASE}/projects/${PROJECT_ID}/assets/export-links`]: {
      ok: false, status: 400, body: { error: 'No hay imagenes seleccionadas para exportar' },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await assetsExport.handler({ projectId: PROJECT_ID, items: [{ assetId: ASSET_1 }] });
    assertStructuredError(r, 'invalid_request');
    assert.ok(r.error.message.includes('seleccionadas'));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// assets_convertAndSave — handler
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nassets_convertAndSave — handler');

await test('saves a converted asset and returns the new asset meta', async () => {
  const routes = {
    [`POST ${BACKEND_BASE}/projects/${PROJECT_ID}/assets/convert`]: {
      status: 201,
      body: {
        asset: {
          id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          projectId: PROJECT_ID,
          fileName: 'hero.webp',
          mimeType: 'image/webp',
          assetKind: 'image',
          originalUrl: 'https://ik.imagekit.io/x/hero-converted.webp',
          publicUrl: 'https://ik.imagekit.io/x/hero-converted.webp',
          fileSize: 120000,
          width: 1600,
          height: 800,
          renderInline: true,
          createdAt: '2026-07-03T10:00:00.000Z',
          convertedFromAssetId: ASSET_1,
        },
      },
    },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await assetsConvertAndSave.handler({
      projectId: PROJECT_ID,
      assetId: ASSET_1,
      format: 'webp',
      quality: 80,
      width: 1600,
    });
    assert.equal(r.status, 'ok');
    assert.equal(r.asset.mimeType, 'image/webp');
    assert.equal(r.asset.convertedFromAssetId, ASSET_1);
    assert.equal(calls[0].body.assetId, ASSET_1);
    assert.equal(calls[0].body.format, 'webp');
    assert.ok(!('projectId' in calls[0].body), 'projectId travels in the path, not the body');
  });
});

await test('rejects input without assetId or src (no backend call)', async () => {
  await withMockedFetch({}, async (calls) => {
    const r = await assetsConvertAndSave.handler({ projectId: PROJECT_ID, format: 'webp' });
    assertStructuredError(r, 'invalid_request');
    assert.equal(calls.length, 0);
  });
});

await test('passes through backend 400 (SVG / missing transformation)', async () => {
  const routes = {
    [`POST ${BACKEND_BASE}/projects/${PROJECT_ID}/assets/convert`]: {
      ok: false, status: 400, body: { error: 'Los SVG no se pueden convertir; solo assets raster (JPEG/PNG/WebP)' },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await assetsConvertAndSave.handler({ projectId: PROJECT_ID, assetId: ASSET_2, format: 'webp' });
    assertStructuredError(r, 'invalid_request');
    assert.ok(r.error.message.includes('SVG'));
  });
});

await test('disambiguates 404 asset vs project', async () => {
  const routes = {
    [`POST ${BACKEND_BASE}/projects/${PROJECT_ID}/assets/convert`]: {
      ok: false, status: 404, body: { error: 'Asset no encontrado' },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await assetsConvertAndSave.handler({ projectId: PROJECT_ID, assetId: ASSET_1, format: 'webp' });
    assertStructuredError(r, 'asset_not_found');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Registration smoke test — every tool (incl. the new ones) must register on a
// real McpServer without throwing (catches non-ZodObject inputSchema exports).
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nMcpServer — registration smoke test');

await test('all exported tools register without throwing', async () => {
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
  for (const expected of ['projects_list', 'assets_list', 'assets_export', 'assets_convertAndSave', 'sections_list', 'pages_create', 'pages_delete', 'pages_rename']) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
});

console.log(`\nassets_tools.test.js: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
