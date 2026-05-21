/**
 * fase2.test.js — Unit tests for Fase 2 MCP tool handlers.
 *
 * Covers:
 *   - schemas/common.js  → projectTypeEnum + businessType corrections
 *   - lib/urlFetcher.js  → isPrivateAddress + reference fetch policy (no real DNS)
 *   - lib/previewStore.js → save/get/delete + TTL expiry
 *   - tools/projects.previewCreateFromContent.js (success + error paths)
 *   - tools/projects.createFromPreview.js (success + invalid preview paths)
 *   - tools/brief.previewPrefill.js (success + wrong projectType)
 *   - tools/pages.previewDraft.js (success + brief rejection)
 *
 * Run with: node src/__tests__/fase2.test.js
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

// ──────────────────────────────────────────────────────────────────────────────
// schemas/common.js — corrections
// ──────────────────────────────────────────────────────────────────────────────

import {
  projectTypeEnum,
  businessType,
  referenceUrls,
} from '../schemas/common.js';

console.log('\nschemas/common.js — projectTypeEnum');

await test('accepts page', () => {
  assert.ok(projectTypeEnum.safeParse('page').success);
});
await test('accepts brief, document, faq', () => {
  for (const v of ['brief', 'document', 'faq']) {
    assert.ok(projectTypeEnum.safeParse(v).success, `should accept ${v}`);
  }
});
await test('rejects legacy values (website, landing_page, etc.)', () => {
  for (const v of ['website', 'landing_page', 'email', 'social', 'ads', 'other']) {
    assert.ok(!projectTypeEnum.safeParse(v).success, `should reject ${v}`);
  }
});

console.log('\nschemas/common.js — businessType');

await test('accepts non-empty string', () => {
  assert.ok(businessType.safeParse('tabula_rasa').success);
  assert.ok(businessType.safeParse('general').success);
});
await test('rejects empty string', () => {
  assert.ok(!businessType.safeParse('').success);
});

console.log('\nschemas/common.js — referenceUrls');

await test('accepts empty list and optional', () => {
  assert.ok(referenceUrls.safeParse(undefined).success);
  assert.ok(referenceUrls.safeParse([]).success);
});
await test('accepts up to 10 valid URLs', () => {
  const list = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}`);
  assert.ok(referenceUrls.safeParse(list).success);
});
await test('rejects more than 10 URLs', () => {
  const list = Array.from({ length: 11 }, (_, i) => `https://example.com/${i}`);
  assert.ok(!referenceUrls.safeParse(list).success);
});
await test('rejects non-URL strings', () => {
  assert.ok(!referenceUrls.safeParse(['not a url']).success);
});

// ──────────────────────────────────────────────────────────────────────────────
// lib/urlFetcher.js — isPrivateAddress (pure)
// ──────────────────────────────────────────────────────────────────────────────

import { isPrivateAddress, fetchReferenceUrl } from '../lib/urlFetcher.js';

console.log('\nlib/urlFetcher.js — isPrivateAddress');

await test('flags IPv4 RFC 1918 ranges', () => {
  for (const ip of ['10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.1', '192.168.1.1']) {
    assert.equal(isPrivateAddress(ip), true, `${ip} should be private`);
  }
});
await test('flags IPv4 loopback and link-local', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('169.254.1.1'), true);
  assert.equal(isPrivateAddress('0.0.0.0'), true);
});
await test('flags IPv4 multicast', () => {
  assert.equal(isPrivateAddress('224.0.0.1'), true);
});
await test('allows public IPv4', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '11.0.0.1']) {
    assert.equal(isPrivateAddress(ip), false, `${ip} should be public`);
  }
});
await test('flags IPv6 loopback / ULA / link-local / multicast', () => {
  assert.equal(isPrivateAddress('::1'), true);
  assert.equal(isPrivateAddress('::'), true);
  assert.equal(isPrivateAddress('fe80::1'), true);
  assert.equal(isPrivateAddress('fd00::1'), true);
  assert.equal(isPrivateAddress('fc00::1'), true);
  assert.equal(isPrivateAddress('ff00::1'), true);
});
await test('flags IPv4-mapped IPv6 private addresses', () => {
  assert.equal(isPrivateAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateAddress('::ffff:192.168.1.1'), true);
});
await test('allows IPv6 public addresses', () => {
  assert.equal(isPrivateAddress('2001:4860:4860::8888'), false);
});
await test('rejects unparseable input', () => {
  assert.equal(isPrivateAddress('not-an-ip'), true);
  assert.equal(isPrivateAddress(''), true);
});

// ──────────────────────────────────────────────────────────────────────────────
// lib/urlFetcher.js — fetchReferenceUrl policy gates
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/urlFetcher.js — fetchReferenceUrl policy');

await test('rejects non-http(s) schemes', async () => {
  const r = await fetchReferenceUrl('file:///etc/passwd');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'protocol_not_allowed');
});
await test('rejects data: URLs', async () => {
  const r = await fetchReferenceUrl('data:text/plain,hello');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'protocol_not_allowed');
});
await test('rejects invalid URL strings', async () => {
  const r = await fetchReferenceUrl('not a url');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid_url');
});
await test('rejects literal localhost', async () => {
  const r = await fetchReferenceUrl('http://localhost/x');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'private_host');
});
await test('rejects literal RFC 1918 IPs', async () => {
  const r = await fetchReferenceUrl('http://192.168.1.1/x');
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'private_host');
});

// Mocked fetch path for happy case
await test('returns body and bytesRead for a normal response', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map([
      ['content-type', 'text/plain'],
      ['content-length', '5'],
    ]),
    body: {
      getReader() {
        let done = false;
        return {
          async read() {
            if (done) return { value: undefined, done: true };
            done = true;
            return { value: new TextEncoder().encode('hello'), done: false };
          },
          async cancel() {},
        };
      },
    },
  });
  try {
    // Use a public-looking IP so isPrivateAddress short-circuits dns lookup.
    const r = await fetchReferenceUrl('http://1.1.1.1/');
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
    assert.equal(r.body, 'hello');
    assert.equal(r.bytesRead, 5);
    assert.equal(r.truncated, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('truncates response above MAX_BYTES', async () => {
  const originalFetch = globalThis.fetch;
  // 3MB payload, capped at 2MB
  const bigChunk = new Uint8Array(3 * 1024 * 1024).fill(65); // 'A'
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map([['content-type', 'text/plain']]),
    body: {
      getReader() {
        let yielded = false;
        return {
          async read() {
            if (yielded) return { value: undefined, done: true };
            yielded = true;
            return { value: bigChunk, done: false };
          },
          async cancel() {},
        };
      },
    },
  });
  try {
    const r = await fetchReferenceUrl('http://1.1.1.1/');
    assert.equal(r.ok, true);
    assert.equal(r.truncated, true);
    assert.equal(r.bytesRead, 2 * 1024 * 1024);
    assert.equal(r.body.length, 2 * 1024 * 1024);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

await test('rejects when content-length exceeds MAX_BYTES', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: new Map([
      ['content-type', 'text/plain'],
      ['content-length', String(5 * 1024 * 1024)],
    ]),
    body: { getReader: () => ({ async read() { return { done: true }; }, async cancel() {} }) },
  });
  try {
    const r = await fetchReferenceUrl('http://1.1.1.1/');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'response_too_large');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// lib/previewStore.js
// ──────────────────────────────────────────────────────────────────────────────

import {
  savePreview,
  getPreview,
  deletePreview,
  _resetPreviewStoreForTests,
} from '../lib/previewStore.js';

console.log('\nlib/previewStore.js');

await test('saves and retrieves a preview', () => {
  _resetPreviewStoreForTests();
  const { previewId } = savePreview('test_kind', { hello: 'world' });
  const entry = getPreview(previewId);
  assert.ok(entry);
  assert.equal(entry.kind, 'test_kind');
  assert.deepEqual(entry.data, { hello: 'world' });
});

await test('previewId is prefixed with prev_', () => {
  _resetPreviewStoreForTests();
  const { previewId } = savePreview('k', {});
  assert.ok(previewId.startsWith('prev_'), `previewId should start with prev_, got ${previewId}`);
});

await test('returns null for unknown previewId', () => {
  _resetPreviewStoreForTests();
  assert.equal(getPreview('prev_unknown'), null);
});

await test('deletePreview removes the entry', () => {
  _resetPreviewStoreForTests();
  const { previewId } = savePreview('k', { a: 1 });
  deletePreview(previewId);
  assert.equal(getPreview(previewId), null);
});

await test('expires entries past their TTL', async () => {
  _resetPreviewStoreForTests();
  const { previewId } = savePreview('k', { a: 1 }, { ttlSeconds: 0.05 });
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(getPreview(previewId), null);
});

await test('rejects empty kind', () => {
  assert.throws(() => savePreview('', {}), /kind must be a non-empty string/);
  assert.throws(() => savePreview(null, {}), /kind must be a non-empty string/);
});

// ──────────────────────────────────────────────────────────────────────────────
// Shared fetch mock for handler tests
// ──────────────────────────────────────────────────────────────────────────────

const BACKEND_BASE = 'http://localhost:3000/api';
const TEST_MCP_TOKEN = 'mcpt_fase2_token';
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
    calls.push({ url: String(url), options });
    const spec = routes[String(url)];
    if (!spec) throw new Error(`No mock configured for URL: ${url}`);
    return makeFetchResponse(spec);
  };
  try {
    await fn(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const COMPANY_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const COMPANY_ID_OTHER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROJECT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ──────────────────────────────────────────────────────────────────────────────
// projects.previewCreateFromContent + createFromPreview (integrated)
// ──────────────────────────────────────────────────────────────────────────────

import * as previewCreate from '../tools/projects.previewCreateFromContent.js';
import * as createFromPreview from '../tools/projects.createFromPreview.js';

console.log('\nprojects.previewCreateFromContent — heuristics (pure)');

await test('deriveProjectName extracts first markdown heading', () => {
  assert.equal(
    previewCreate.deriveProjectName('# My Project\n\nbody'),
    'My Project',
  );
});
await test('deriveProjectName falls back to first non-empty line when no heading', () => {
  assert.equal(previewCreate.deriveProjectName('  \n  \nFirst line.\nSecond line.'), 'First line.');
});
await test('deriveProjectName prefers heading even when not at top', () => {
  assert.equal(previewCreate.deriveProjectName('Intro line\n\n# Heading'), 'Heading');
});
await test('deriveProjectName handles empty input', () => {
  assert.equal(previewCreate.deriveProjectName(''), 'Nuevo proyecto');
});
await test('detectProjectType returns faq for repeated questions', () => {
  const content = '¿Pregunta uno?\n¿Pregunta dos?\n¿Pregunta tres?\n¿Pregunta cuatro?';
  assert.equal(previewCreate.detectProjectType(content), 'faq');
});
await test('detectProjectType returns brief when content mentions brief', () => {
  assert.equal(previewCreate.detectProjectType('Cuestionario de inicio'), 'brief');
});
await test('detectProjectType returns document for long prose with no headings', () => {
  const longProse = ('palabra '.repeat(300)).trim();
  assert.equal(previewCreate.detectProjectType(longProse), 'document');
});
await test('detectProjectType defaults to page', () => {
  assert.equal(previewCreate.detectProjectType('# Hola\nContenido corto'), 'page');
});

console.log('\nprojects.previewCreateFromContent — success path');

await test('validates company access, derives name+type, saves preview', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/companies`]: {
      body: { companies: [{ id: COMPANY_ID, name: 'Acme' }] },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await previewCreate.handler({
      companyId: COMPANY_ID,
      content: '# Sitio nuevo\n\nLanding para clientes B2B.',
    });
    assert.equal(result.status, 'ok');
    assert.equal(result.tool, previewCreate.name);
    assert.ok(result.previewId.startsWith('prev_'));
    assert.equal(result.preview.companyId, COMPANY_ID);
    assert.equal(result.preview.companyName, 'Acme');
    assert.equal(result.preview.name, 'Sitio nuevo');
    assert.equal(result.preview.projectType, 'page');
    assert.equal(result.preview.businessType, 'tabula_rasa');
    assert.ok(typeof result.expiresAt === 'string');
    assert.deepEqual(result.fetchedUrls, []);
  });
});

await test('honors explicit projectType / businessType / name overrides', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/companies`]: {
      body: { companies: [{ id: COMPANY_ID, name: 'Acme' }] },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await previewCreate.handler({
      companyId: COMPANY_ID,
      content: 'cualquier cosa',
      projectType: 'document',
      businessType: 'general',
      name: 'Reporte Q1',
      clientName: 'Globex',
      clientEmail: 'hi@globex.com',
    });
    assert.equal(result.preview.projectType, 'document');
    assert.equal(result.preview.businessType, 'general');
    assert.equal(result.preview.name, 'Reporte Q1');
    assert.equal(result.preview.clientName, 'Globex');
    assert.equal(result.preview.clientEmail, 'hi@globex.com');
  });
});

await test('returns company_not_found when company is not in /companies', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/companies`]: { body: { companies: [] } },
  };
  await withMockedFetch(routes, async () => {
    const result = await previewCreate.handler({
      companyId: COMPANY_ID,
      content: 'x',
    });
    assertStructuredError(result, 'company_not_found');
  });
});

console.log('\nprojects.createFromPreview — full preview→create flow');

await test('end-to-end: preview then create posts to /projects and returns projectId', async () => {
  _resetPreviewStoreForTests();
  const NEW_PROJECT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

  // Step 1: build preview
  let previewId;
  await withMockedFetch(
    {
      [`${BACKEND_BASE}/companies`]: {
        body: { companies: [{ id: COMPANY_ID, name: 'Acme' }] },
      },
    },
    async () => {
      const r = await previewCreate.handler({
        companyId: COMPANY_ID,
        content: '# Mi sitio\nbody',
        projectType: 'page',
      });
      previewId = r.previewId;
    },
  );

  // Step 2: apply
  await withMockedFetch(
    {
      [`${BACKEND_BASE}/projects`]: {
        body: {
          project: {
            id: NEW_PROJECT_ID,
            name: 'Mi sitio',
            company_id: COMPANY_ID,
            project_type: 'page',
            business_type: 'tabula_rasa',
            client_name: 'Acme',
            client_email: null,
            created_at: '2026-05-20T10:00:00Z',
            updated_at: '2026-05-20T10:00:00Z',
          },
        },
      },
    },
    async (calls) => {
      const r = await createFromPreview.handler({ companyId: COMPANY_ID, previewId });
      assert.equal(r.status, 'ok');
      assert.equal(r.projectId, NEW_PROJECT_ID);
      assert.equal(r.project.projectType, 'page');
      assert.equal(r.project.businessType, 'tabula_rasa');

      // Verify the POST payload
      assert.equal(calls.length, 1);
      const body = JSON.parse(calls[0].options.body);
      assert.deepEqual(body, {
        companyId: COMPANY_ID,
        name: 'Mi sitio',
        projectType: 'page',
        businessType: 'tabula_rasa',
      });
    },
  );

  // Step 3: preview is burned, second apply fails
  const second = await createFromPreview.handler({ companyId: COMPANY_ID, previewId });
  assertStructuredError(second, 'preview_not_found');
});

await test('createFromPreview applies overrides on top of preview', async () => {
  _resetPreviewStoreForTests();
  const NEW_PROJECT_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

  let previewId;
  await withMockedFetch(
    {
      [`${BACKEND_BASE}/companies`]: {
        body: { companies: [{ id: COMPANY_ID, name: 'Acme' }] },
      },
    },
    async () => {
      const r = await previewCreate.handler({
        companyId: COMPANY_ID,
        content: '# Borrador inicial',
        projectType: 'page',
      });
      previewId = r.previewId;
    },
  );

  await withMockedFetch(
    {
      [`${BACKEND_BASE}/projects`]: {
        body: {
          project: {
            id: NEW_PROJECT_ID,
            name: 'Nombre corregido',
            company_id: COMPANY_ID,
            project_type: 'document',
            business_type: 'general',
            client_name: 'Globex',
            client_email: 'ops@globex.com',
          },
        },
      },
    },
    async (calls) => {
      const r = await createFromPreview.handler({
        companyId: COMPANY_ID,
        previewId,
        overrides: {
          name: 'Nombre corregido',
          projectType: 'document',
          businessType: 'general',
          clientName: 'Globex',
          clientEmail: 'ops@globex.com',
        },
      });
      assert.equal(r.status, 'ok');
      assert.equal(r.project.name, 'Nombre corregido');
      assert.equal(r.project.projectType, 'document');
      assert.equal(r.project.businessType, 'general');
      assert.equal(r.project.clientName, 'Globex');
      assert.equal(r.project.clientEmail, 'ops@globex.com');

      // The POST payload reflects the overrides, not the preview defaults.
      const body = JSON.parse(calls[0].options.body);
      assert.equal(body.name, 'Nombre corregido');
      assert.equal(body.projectType, 'document');
      assert.equal(body.businessType, 'general');
      assert.equal(body.clientName, 'Globex');
      assert.equal(body.clientEmail, 'ops@globex.com');
    },
  );
});

await test('createFromPreview rejects invalid override values via schema', async () => {
  const parsed = createFromPreview.inputSchema.safeParse({
    companyId: COMPANY_ID,
    previewId: 'prev_x',
    overrides: { projectType: 'website' }, // not in enum
  });
  assert.ok(!parsed.success, 'should reject projectType=website');
});

await test('createFromPreview rejects mismatched companyId', async () => {
  _resetPreviewStoreForTests();
  let previewId;
  await withMockedFetch(
    {
      [`${BACKEND_BASE}/companies`]: {
        body: { companies: [{ id: COMPANY_ID, name: 'Acme' }] },
      },
    },
    async () => {
      const r = await previewCreate.handler({
        companyId: COMPANY_ID,
        content: '# x',
      });
      previewId = r.previewId;
    },
  );

  const result = await createFromPreview.handler({
    companyId: COMPANY_ID_OTHER,
    previewId,
  });
  assertStructuredError(result, 'preview_company_mismatch');
});

await test('createFromPreview rejects wrong-kind previewId', async () => {
  _resetPreviewStoreForTests();
  // Save a preview of the wrong kind directly
  const { previewId } = savePreview('brief_prefill', { projectId: PROJECT_ID });
  const result = await createFromPreview.handler({ companyId: COMPANY_ID, previewId });
  assertStructuredError(result, 'preview_kind_mismatch');
});

await test('createFromPreview returns preview_not_found for unknown id', async () => {
  _resetPreviewStoreForTests();
  const result = await createFromPreview.handler({
    companyId: COMPANY_ID,
    previewId: 'prev_does_not_exist',
  });
  assertStructuredError(result, 'preview_not_found');
});

// ──────────────────────────────────────────────────────────────────────────────
// brief.previewPrefill
// ──────────────────────────────────────────────────────────────────────────────

import * as briefPrefill from '../tools/brief.previewPrefill.js';

console.log('\nbrief.previewPrefill — success path');

await test('returns answerable questions + sections + content echo', async () => {
  _resetPreviewStoreForTests();
  const QID_SHORT = 'q-short';
  const QID_LONG = 'q-long';
  const QID_SECTION = 'q-section';
  const QID_FILE = 'q-file';

  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: {
          id: PROJECT_ID,
          name: 'Brief test',
          projectType: 'brief',
          companyId: COMPANY_ID,
        },
        pages: [
          {
            id: 'page-1',
            name: 'Brief',
            position: 0,
            contentJson: {
              formTitle: 'Brief de inicio',
              questions: [
                { id: QID_SECTION, type: 'section_header', label: 'Section A' },
                { id: QID_SHORT, type: 'short_text', label: 'Nombre comercial' },
                { id: QID_LONG, type: 'long_text', label: 'Descripcion', hint: 'En 2-3 lineas' },
                { id: QID_FILE, type: 'file_upload', label: 'Logo' },
              ],
            },
          },
        ],
      },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await briefPrefill.handler({
      projectId: PROJECT_ID,
      content: 'Cliente: Acme. Negocio: agencia.',
    });
    assert.equal(result.status, 'ok');
    assert.ok(result.previewId.startsWith('prev_'));
    assert.equal(result.questions.length, 2);
    assert.deepEqual(
      result.questions.map((q) => q.id).sort(),
      [QID_LONG, QID_SHORT].sort(),
    );
    assert.equal(result.sections.length, 1);
    assert.equal(result.sections[0].id, QID_SECTION);
    assert.equal(result.content, 'Cliente: Acme. Negocio: agencia.');
    assert.equal(result.project.projectType, 'brief');
  });
});

await test('rejects projects that are not type=brief', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: { id: PROJECT_ID, name: 'p', projectType: 'page', companyId: COMPANY_ID },
        pages: [],
      },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await briefPrefill.handler({
      projectId: PROJECT_ID,
      content: 'x',
    });
    assertStructuredError(result, 'invalid_project_type');
  });
});

await test('rejects archived project', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: {
          id: PROJECT_ID,
          name: 'p',
          projectType: 'brief',
          companyId: COMPANY_ID,
          archivedAt: '2026-05-01T00:00:00Z',
        },
        pages: [],
      },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await briefPrefill.handler({ projectId: PROJECT_ID, content: 'x' });
    assertStructuredError(result, 'project_not_mutable');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// pages.previewDraft
// ──────────────────────────────────────────────────────────────────────────────

import * as pagesPreviewDraft from '../tools/pages.previewDraft.js';

console.log('\npages.previewDraft — success path');

await test('derivePageName follows the same rule as project name', () => {
  assert.equal(pagesPreviewDraft.derivePageName('# Inicio\nbody'), 'Inicio');
  assert.equal(pagesPreviewDraft.derivePageName(''), 'Nueva página');
});

await test('returns project context + existing pages + draft suggestion', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: {
          id: PROJECT_ID,
          name: 'Mi proyecto',
          projectType: 'page',
          companyId: COMPANY_ID,
        },
        pages: [
          { id: 'p1', name: 'Inicio', position: 0, reviewStatus: 'approved' },
          { id: 'p2', name: 'Contacto', position: 1 },
        ],
      },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await pagesPreviewDraft.handler({
      projectId: PROJECT_ID,
      content: '# Servicios\nlista de servicios',
    });
    assert.equal(result.status, 'ok');
    assert.ok(result.previewId.startsWith('prev_'));
    assert.equal(result.project.projectType, 'page');
    assert.equal(result.draft.pageName, 'Servicios');
    assert.equal(result.draft.position, 2);
    assert.equal(result.existingPages.length, 2);
    assert.equal(result.existingPages[0].name, 'Inicio');
    assert.deepEqual(result.fetchedUrls, []);
  });
});

await test('honors explicit pageName override', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: { id: PROJECT_ID, name: 'p', projectType: 'document', companyId: COMPANY_ID },
        pages: [],
      },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await pagesPreviewDraft.handler({
      projectId: PROJECT_ID,
      content: '# ignored',
      pageName: 'Mi pagina',
    });
    assert.equal(result.draft.pageName, 'Mi pagina');
    assert.equal(result.draft.position, 0);
  });
});

await test('rejects projectType=brief', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: { id: PROJECT_ID, name: 'p', projectType: 'brief', companyId: COMPANY_ID },
        pages: [],
      },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await pagesPreviewDraft.handler({ projectId: PROJECT_ID, content: 'x' });
    assertStructuredError(result, 'invalid_project_type');
  });
});

await test('rejects trashed project', async () => {
  _resetPreviewStoreForTests();
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: {
        project: {
          id: PROJECT_ID,
          name: 'p',
          projectType: 'page',
          companyId: COMPANY_ID,
          trashedAt: '2026-05-01T00:00:00Z',
        },
        pages: [],
      },
    },
  };
  await withMockedFetch(routes, async () => {
    const result = await pagesPreviewDraft.handler({ projectId: PROJECT_ID, content: 'x' });
    assertStructuredError(result, 'project_not_mutable');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// mcp_token_missing on every Fase 2 handler
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nFase 2 handlers — mcp_token_missing error path');

const savedToken = process.env.WEBRIEF_MCP_TOKEN;
delete process.env.WEBRIEF_MCP_TOKEN;

await test('projects.previewCreateFromContent returns mcp_token_missing', async () => {
  const r = await previewCreate.handler({ companyId: COMPANY_ID, content: 'x' });
  assertStructuredError(r, 'mcp_token_missing');
});
await test('projects.createFromPreview returns mcp_token_missing', async () => {
  const r = await createFromPreview.handler({
    companyId: COMPANY_ID,
    previewId: 'prev_any',
  });
  assertStructuredError(r, 'mcp_token_missing');
});
await test('brief.previewPrefill returns mcp_token_missing', async () => {
  const r = await briefPrefill.handler({ projectId: PROJECT_ID, content: 'x' });
  assertStructuredError(r, 'mcp_token_missing');
});
await test('pages.previewDraft returns mcp_token_missing', async () => {
  const r = await pagesPreviewDraft.handler({ projectId: PROJECT_ID, content: 'x' });
  assertStructuredError(r, 'mcp_token_missing');
});

if (savedToken !== undefined) process.env.WEBRIEF_MCP_TOKEN = savedToken;

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
