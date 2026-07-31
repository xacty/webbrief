/**
 * section_blocks.test.js — Unit tests for the ordered blocks[] feature added
 * across lib/editOps.js and tools/pages_create.js:
 *
 *   - blockSchema / blockArraySchema (exported from lib/editOps.js): a
 *     paragraph|heading discriminated union, array of 1-60, used to let
 *     callers emit paragraphs and headings in ANY order (not just the
 *     hardcoded "heading then body" shape).
 *   - nodesFromBlocks(blocks): builds ProseMirror nodes from a validated
 *     blocks[] array, in caller-given order.
 *   - New op `replace_section_content` {sectionId, blocks}: replaces an
 *     entire section's body (divider untouched), removing whatever was
 *     there before (including tables).
 *   - insert_section gained blocks[], which TAKES PRECEDENCE over
 *     headingText/bodyText (warning emitted when both are supplied).
 *   - pages_create's sections[] items gained blocks[], same precedence
 *     over headingLevel/headingText/paragraphs (silent, no warning).
 *
 * Run with: node src/__tests__/section_blocks.test.js
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

import {
  editOpSchema,
  applyEditsToContentJson,
  blockSchema,
  blockArraySchema,
  nodesFromBlocks,
  textOfNode,
} from '../lib/editOps.js';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

// Doc with 3 sections, mirrors table_ops.test.js / fase3.test.js buildPageDoc
// but with a 3rd section so we can assert neighbors on BOTH sides of an
// edited middle section stay intact.
function buildThreeSectionDoc() {
  return {
    type: 'doc',
    content: [
      { type: 'sectionDivider', attrs: { sectionId: 'sec-1', sectionName: 'Sección 1' } },
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hola' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo uno' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo dos' }] },
      { type: 'sectionDivider', attrs: { sectionId: 'sec-2', sectionName: 'Sección 2' } },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Sub' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'mundo' }] },
      { type: 'sectionDivider', attrs: { sectionId: 'sec-3', sectionName: 'Sección 3' } },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Tres' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo tres' }] },
    ],
  };
}

// Same doc, but sec-2's body has a table instead of heading+paragraph, to
// verify replace_section_content removes it.
function buildDocWithTableInSection2() {
  return {
    type: 'doc',
    content: [
      { type: 'sectionDivider', attrs: { sectionId: 'sec-1', sectionName: 'Sección 1' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo uno' }] },
      { type: 'sectionDivider', attrs: { sectionId: 'sec-2', sectionName: 'Sección 2' } },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'H1' }] }] },
            ],
          },
          {
            type: 'tableRow',
            content: [
              { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c1' }] }] },
            ],
          },
        ],
      },
      { type: 'sectionDivider', attrs: { sectionId: 'sec-3', sectionName: 'Sección 3' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'cuerpo tres' }] },
    ],
  };
}

function findAllTables(doc) {
  return doc.content.filter((n) => n.type === 'table');
}

function sectionBody(doc, sectionId) {
  const dividerIdx = doc.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionId === sectionId,
  );
  assert.notEqual(dividerIdx, -1, `divider for ${sectionId} not found`);
  let nextDividerIdx = doc.content.findIndex(
    (n, i) => i > dividerIdx && n.type === 'sectionDivider',
  );
  if (nextDividerIdx === -1) nextDividerIdx = doc.content.length;
  return doc.content.slice(dividerIdx + 1, nextDividerIdx);
}

// ──────────────────────────────────────────────────────────────────────────────
// Schema — blockSchema / blockArraySchema
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — blockSchema / blockArraySchema');

await test('blockArraySchema accepts [paragraph, heading, paragraph]', () => {
  const r = blockArraySchema.safeParse([
    { type: 'paragraph', text: 'SERVICIOS' },
    { type: 'heading', level: 2, text: 'Tipos de consulta' },
    { type: 'paragraph', text: 'Cada mujer...' },
  ]);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
  assert.equal(r.data.length, 3);
});

await test('heading block without level parses with level 2 default', () => {
  const r = blockSchema.safeParse({ type: 'heading', text: 'Sin nivel' });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
  assert.equal(r.data.level, 2);
});

await test('blockArraySchema rejects an empty array', () => {
  const r = blockArraySchema.safeParse([]);
  assert.ok(!r.success);
});

await test('blockArraySchema rejects more than 60 blocks', () => {
  const blocks = Array.from({ length: 61 }, () => ({ type: 'paragraph', text: 'x' }));
  const r = blockArraySchema.safeParse(blocks);
  assert.ok(!r.success);
});

await test('blockArraySchema accepts exactly 60 blocks', () => {
  const blocks = Array.from({ length: 60 }, () => ({ type: 'paragraph', text: 'x' }));
  const r = blockArraySchema.safeParse(blocks);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

await test('blockArraySchema rejects a heading with empty text', () => {
  const r = blockArraySchema.safeParse([{ type: 'heading', text: '' }]);
  assert.ok(!r.success);
});

await test('blockArraySchema rejects heading level 7', () => {
  const r = blockArraySchema.safeParse([{ type: 'heading', level: 7, text: 'x' }]);
  assert.ok(!r.success);
});

await test('blockArraySchema rejects heading level 0', () => {
  const r = blockArraySchema.safeParse([{ type: 'heading', level: 0, text: 'x' }]);
  assert.ok(!r.success);
});

await test('blockArraySchema rejects an unknown block type', () => {
  const r = blockArraySchema.safeParse([{ type: 'quote', text: 'x' }]);
  assert.ok(!r.success);
});

await test('blockArraySchema accepts a paragraph with empty text', () => {
  const r = blockArraySchema.safeParse([{ type: 'paragraph', text: '' }]);
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

await test('editOpSchema: replace_section_content requires sectionId + blocks', () => {
  const ok = editOpSchema.safeParse({
    op: 'replace_section_content',
    sectionId: 'sec-1',
    blocks: [{ type: 'paragraph', text: 'x' }],
  });
  assert.ok(ok.success, JSON.stringify(ok.error?.issues));

  const missingSectionId = editOpSchema.safeParse({
    op: 'replace_section_content',
    blocks: [{ type: 'paragraph', text: 'x' }],
  });
  assert.ok(!missingSectionId.success);

  const missingBlocks = editOpSchema.safeParse({
    op: 'replace_section_content',
    sectionId: 'sec-1',
  });
  assert.ok(!missingBlocks.success);
});

// ──────────────────────────────────────────────────────────────────────────────
// nodesFromBlocks
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — nodesFromBlocks');

await test('nodesFromBlocks builds nodes in the exact given order', () => {
  const nodes = nodesFromBlocks([
    { type: 'paragraph', text: 'a' },
    { type: 'heading', level: 3, text: 'b' },
    { type: 'paragraph', text: 'c' },
  ]);
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].type, 'paragraph');
  assert.equal(textOfNode(nodes[0]), 'a');
  assert.equal(nodes[1].type, 'heading');
  assert.equal(nodes[1].attrs.level, 3);
  assert.equal(textOfNode(nodes[1]), 'b');
  assert.equal(nodes[2].type, 'paragraph');
  assert.equal(textOfNode(nodes[2]), 'c');
});

await test('nodesFromBlocks defaults heading level to 2 when omitted from the block object', () => {
  const nodes = nodesFromBlocks([{ type: 'heading', text: 'sin nivel' }]);
  assert.equal(nodes[0].attrs.level, 2);
});

// ──────────────────────────────────────────────────────────────────────────────
// replace_section_content (via applyEditsToContentJson)
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — replace_section_content');

await test('CASO PLENA: replaces sec-2 body with paragraph-before-heading order, divider + neighbors intact', () => {
  const before = buildThreeSectionDoc();
  const r = applyEditsToContentJson({
    contentJson: before,
    ops: [
      {
        op: 'replace_section_content',
        sectionId: 'sec-2',
        blocks: [
          { type: 'paragraph', text: 'SERVICIOS' },
          { type: 'heading', level: 2, text: 'Tipos de consulta' },
          { type: 'paragraph', text: 'Cada mujer...' },
        ],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });

  assert.equal(r.opsApplied[0].matched, true);
  assert.deepEqual(r.warnings, []);

  const doc = r.contentJson;

  // Divider for sec-2 is untouched (same sectionId + name), still 3 dividers.
  const dividers = doc.content.filter((n) => n.type === 'sectionDivider');
  assert.equal(dividers.length, 3);
  const divider2 = dividers.find((d) => d.attrs.sectionId === 'sec-2');
  assert.ok(divider2, 'sec-2 divider must survive');
  assert.equal(divider2.attrs.sectionName, 'Sección 2');

  // Body of sec-2 is EXACTLY the 3 new blocks, in that exact order —
  // paragraph BEFORE heading (the point of blocks[] over headingText/bodyText).
  const body = sectionBody(doc, 'sec-2');
  assert.equal(body.length, 3);
  assert.equal(body[0].type, 'paragraph');
  assert.equal(textOfNode(body[0]), 'SERVICIOS');
  assert.equal(body[1].type, 'heading');
  assert.equal(body[1].attrs.level, 2);
  assert.equal(textOfNode(body[1]), 'Tipos de consulta');
  assert.equal(body[2].type, 'paragraph');
  assert.equal(textOfNode(body[2]), 'Cada mujer...');

  // Neighboring sections (sec-1 before, sec-3 after) are byte-for-byte intact.
  assert.deepEqual(sectionBody(doc, 'sec-1'), sectionBody(before, 'sec-1'));
  assert.deepEqual(sectionBody(doc, 'sec-3'), sectionBody(before, 'sec-3'));
});

await test('summary carries correct blockCountBefore/blockCountAfter', () => {
  const r = applyEditsToContentJson({
    contentJson: buildThreeSectionDoc(),
    ops: [
      {
        op: 'replace_section_content',
        sectionId: 'sec-2',
        // sec-2 body before = [heading, paragraph] = 2 nodes
        blocks: [
          { type: 'paragraph', text: 'a' },
          { type: 'paragraph', text: 'b' },
          { type: 'heading', text: 'c' },
          { type: 'paragraph', text: 'd' },
        ], // 4 nodes after
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const summary = r.opsApplied[0];
  assert.equal(summary.blockCountBefore, 2);
  assert.equal(summary.blockCountAfter, 4);
});

await test('sectionId not found → warning, doc left intact', () => {
  const before = buildThreeSectionDoc();
  const r = applyEditsToContentJson({
    contentJson: before,
    ops: [
      {
        op: 'replace_section_content',
        sectionId: 'does-not-exist',
        blocks: [{ type: 'paragraph', text: 'x' }],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.ok(r.warnings.length === 1, `expected 1 warning, got: ${JSON.stringify(r.warnings)}`);
  assert.match(r.warnings[0], /does-not-exist/);
  assert.deepEqual(r.contentJson.content, before.content);
});

await test('replace removes an existing table in the section (documented behavior)', () => {
  const before = buildDocWithTableInSection2();
  assert.equal(findAllTables(before).length, 1, 'fixture sanity: 1 table before');

  const r = applyEditsToContentJson({
    contentJson: before,
    ops: [
      {
        op: 'replace_section_content',
        sectionId: 'sec-2',
        blocks: [{ type: 'paragraph', text: 'reemplazo sin tabla' }],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });

  assert.equal(r.opsApplied[0].matched, true);
  const doc = r.contentJson;
  assert.equal(findAllTables(doc).length, 0, 'table must be gone after replace_section_content');
  const body = sectionBody(doc, 'sec-2');
  assert.equal(body.length, 1);
  assert.equal(body[0].type, 'paragraph');
  assert.equal(textOfNode(body[0]), 'reemplazo sin tabla');
});

await test('a paragraph block with text: "" is permitted and produces an empty paragraph', () => {
  const r = applyEditsToContentJson({
    contentJson: buildThreeSectionDoc(),
    ops: [
      {
        op: 'replace_section_content',
        sectionId: 'sec-2',
        blocks: [{ type: 'paragraph', text: '' }],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  const body = sectionBody(r.contentJson, 'sec-2');
  assert.equal(body.length, 1);
  assert.equal(body[0].type, 'paragraph');
  assert.equal(textOfNode(body[0]), '');
});

// ──────────────────────────────────────────────────────────────────────────────
// insert_section with blocks[]
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — insert_section with blocks[]');

await test('insert_section with blocks[] emits the exact given order (paragraph, heading, paragraph)', () => {
  const r = applyEditsToContentJson({
    contentJson: buildThreeSectionDoc(),
    ops: [
      {
        op: 'insert_section',
        name: 'Sección nueva',
        blocks: [
          { type: 'paragraph', text: 'eyebrow' },
          { type: 'heading', level: 2, text: 'Título' },
          { type: 'paragraph', text: 'cuerpo' },
        ],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  assert.deepEqual(r.warnings, []);

  const doc = r.contentJson;
  const newDividerIdx = doc.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionName === 'Sección nueva',
  );
  assert.notEqual(newDividerIdx, -1);
  const n1 = doc.content[newDividerIdx + 1];
  const n2 = doc.content[newDividerIdx + 2];
  const n3 = doc.content[newDividerIdx + 3];
  assert.equal(n1.type, 'paragraph');
  assert.equal(textOfNode(n1), 'eyebrow');
  assert.equal(n2.type, 'heading');
  assert.equal(textOfNode(n2), 'Título');
  assert.equal(n3.type, 'paragraph');
  assert.equal(textOfNode(n3), 'cuerpo');
});

await test('insert_section: blocks[] + headingText together → blocks wins, warning present', () => {
  const r = applyEditsToContentJson({
    contentJson: buildThreeSectionDoc(),
    ops: [
      {
        op: 'insert_section',
        name: 'Sección nueva',
        headingText: 'Debe ser ignorado',
        bodyText: 'También ignorado',
        blocks: [{ type: 'paragraph', text: 'gana blocks' }],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const summary = r.opsApplied[0];
  assert.equal(summary.matched, true);
  assert.ok(summary.warning, 'expected a warning when blocks[] + headingText/bodyText are both supplied');
  assert.match(summary.warning, /blocks/i);
  assert.ok(r.warnings.length === 1);

  const doc = r.contentJson;
  const newDividerIdx = doc.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionName === 'Sección nueva',
  );
  const body = doc.content.slice(newDividerIdx + 1);
  const nextDividerIdx = body.findIndex((n) => n.type === 'sectionDivider');
  const sectionBodyNodes = nextDividerIdx === -1 ? body : body.slice(0, nextDividerIdx);

  assert.equal(sectionBodyNodes.length, 1, 'headingText/bodyText must be fully ignored, only the 1 block emitted');
  assert.equal(sectionBodyNodes[0].type, 'paragraph');
  assert.equal(textOfNode(sectionBodyNodes[0]), 'gana blocks');
  assert.ok(
    !sectionBodyNodes.some((n) => n.type === 'heading'),
    'headingText must not have produced a heading node',
  );
});

await test('insert_section without blocks[]: legacy heading-then-body behavior unchanged', () => {
  const r = applyEditsToContentJson({
    contentJson: buildThreeSectionDoc(),
    ops: [
      {
        op: 'insert_section',
        name: 'Legacy',
        headingText: 'Título legacy',
        bodyText: 'Cuerpo legacy',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  assert.equal(r.opsApplied[0].warning, undefined, 'no warning expected when blocks[] is absent');

  const doc = r.contentJson;
  const newDividerIdx = doc.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionName === 'Legacy',
  );
  const heading = doc.content[newDividerIdx + 1];
  const body = doc.content[newDividerIdx + 2];
  assert.equal(heading.type, 'heading');
  assert.equal(textOfNode(heading), 'Título legacy');
  assert.equal(body.type, 'paragraph');
  assert.equal(textOfNode(body), 'Cuerpo legacy');
});

// ──────────────────────────────────────────────────────────────────────────────
// pages_create with sections[].blocks[]  (withMockedFetch, mirrors
// pages_create.test.js's own harness)
// ──────────────────────────────────────────────────────────────────────────────

console.log('\npages_create — sections[].blocks[]');

const BACKEND_BASE = 'http://localhost:3000/api';
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-section-blocks';
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

const pagesCreate = await import('../tools/pages_create.js');

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildEmptyProjectResponse(projectType = 'page') {
  return {
    project: {
      id: PROJECT_ID,
      name: 'P',
      projectType,
      companyId: 'co',
    },
    pages: [],
  };
}

const GET_KEY = `GET ${BACKEND_BASE}/projects/${PROJECT_ID}`;
const PUT_KEY = `PUT ${BACKEND_BASE}/projects/${PROJECT_ID}/pages`;

await test('pages_create: sections[].blocks[] produces divider→paragraph→heading→paragraph in that order', async () => {
  const routes = {
    [GET_KEY]: { body: buildEmptyProjectResponse('page') },
    [PUT_KEY]: { body: { pages: [] } },
  };

  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({
      projectId: PROJECT_ID,
      name: 'Landing',
      sections: [
        {
          name: 'Servicios',
          blocks: [
            { type: 'paragraph', text: 'SERVICIOS' },
            { type: 'heading', text: 'Tipos de consulta' },
            { type: 'paragraph', text: 'Intro' },
          ],
        },
      ],
    });
    assert.equal(r.status, 'ok');

    const putCall = calls.find((c) => c.method === 'PUT');
    const newPage = putCall.body.pages.find((p) => p.name === 'Landing');
    assert.ok(newPage);
    const content = newPage.contentJson.content;

    assert.equal(content[0].type, 'sectionDivider');
    assert.equal(content[0].attrs.sectionName, 'Servicios');
    assert.equal(content[1].type, 'paragraph');
    assert.equal(content[1].content[0].text, 'SERVICIOS');
    assert.equal(content[2].type, 'heading');
    assert.equal(content[2].attrs.level, 2);
    assert.equal(content[2].content[0].text, 'Tipos de consulta');
    assert.equal(content[3].type, 'paragraph');
    assert.equal(content[3].content[0].text, 'Intro');
  });
});

await test('pages_create: sections[].blocks[] + paragraphs together → blocks wins, paragraphs ignored (no warning field)', async () => {
  const routes = {
    [GET_KEY]: { body: buildEmptyProjectResponse('page') },
    [PUT_KEY]: { body: { pages: [] } },
  };

  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({
      projectId: PROJECT_ID,
      name: 'Landing',
      sections: [
        {
          name: 'Servicios',
          headingText: 'Debe ser ignorado',
          paragraphs: ['También ignorado'],
          blocks: [{ type: 'paragraph', text: 'gana blocks' }],
        },
      ],
    });
    assert.equal(r.status, 'ok');

    const putCall = calls.find((c) => c.method === 'PUT');
    const newPage = putCall.body.pages.find((p) => p.name === 'Landing');
    const content = newPage.contentJson.content;

    // divider + exactly 1 block from blocks[] — nothing from
    // headingText/paragraphs leaked in.
    assert.equal(content.length, 2);
    assert.equal(content[0].type, 'sectionDivider');
    assert.equal(content[1].type, 'paragraph');
    assert.equal(content[1].content[0].text, 'gana blocks');
    assert.ok(
      !content.some((n) => n.type === 'heading'),
      'headingText must not have produced a heading node',
    );
  });
});

await test('pages_create: without blocks[], legacy heading→paragraphs behavior is unchanged', async () => {
  const routes = {
    [GET_KEY]: { body: buildEmptyProjectResponse('page') },
    [PUT_KEY]: { body: { pages: [] } },
  };

  await withMockedFetch(routes, async (calls) => {
    const r = await pagesCreate.handler({
      projectId: PROJECT_ID,
      name: 'Landing',
      sections: [
        {
          name: 'Intro',
          headingText: 'Bienvenida',
          paragraphs: ['Primer párrafo.'],
        },
      ],
    });
    assert.equal(r.status, 'ok');

    const putCall = calls.find((c) => c.method === 'PUT');
    const newPage = putCall.body.pages.find((p) => p.name === 'Landing');
    const content = newPage.contentJson.content;

    assert.equal(content[0].type, 'sectionDivider');
    assert.equal(content[1].type, 'heading');
    assert.equal(content[1].content[0].text, 'Bienvenida');
    assert.equal(content[2].type, 'paragraph');
    assert.equal(content[2].content[0].text, 'Primer párrafo.');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration: applyEditsToContentJson + ensureInvariants → contentHtml order
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nintegration — blocks[] order survives ensureInvariants HTML serialization');

await test('page-type: replace_section_content blocks[] order (P before H2) is preserved in contentHtml', async () => {
  const { ensureInvariants } = await import('../../../../shared/documentInvariants.js');

  const edited = applyEditsToContentJson({
    contentJson: buildThreeSectionDoc(),
    ops: [
      {
        op: 'replace_section_content',
        sectionId: 'sec-2',
        blocks: [
          { type: 'paragraph', text: 'SERVICIOS' },
          { type: 'heading', level: 2, text: 'Tipos de consulta' },
        ],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });

  const normalized = ensureInvariants(edited.contentJson, 'page');
  const html = normalized.contentHtml;
  const pIdx = html.indexOf('<p>SERVICIOS</p>');
  const hIdx = html.indexOf('<h2>Tipos de consulta</h2>');
  assert.ok(pIdx !== -1, `expected <p>SERVICIOS</p> in html, got: ${html}`);
  assert.ok(hIdx !== -1, `expected <h2>Tipos de consulta</h2> in html, got: ${html}`);
  assert.ok(pIdx < hIdx, 'paragraph must appear BEFORE the heading in contentHtml');
});

await test('document-type: dividers are stripped but P→H2→P order from blocks[] is preserved in contentHtml', async () => {
  const { ensureInvariants } = await import('../../../../shared/documentInvariants.js');

  // Linear document doc (no dividers) — insert_section's blocks[] path used
  // as a generic "ordered block builder" here via a single doc-level batch:
  // build a minimal doc + use replace_section_content is section-specific,
  // so for 'document' projectType we exercise nodesFromBlocks the same way
  // pages_create does: build content directly, then run it through
  // ensureInvariants('document').
  const rawDoc = {
    type: 'doc',
    content: nodesFromBlocks([
      { type: 'paragraph', text: 'SERVICIOS' },
      { type: 'heading', level: 2, text: 'Tipos de consulta' },
      { type: 'paragraph', text: 'Cada mujer...' },
    ]),
  };

  const normalized = ensureInvariants(rawDoc, 'document');
  const html = normalized.contentHtml;
  assert.ok(!/sectionDivider/.test(JSON.stringify(normalized.contentJson)), 'document type must not carry dividers');
  const pIdx = html.indexOf('<p>SERVICIOS</p>');
  const hIdx = html.indexOf('<h2>Tipos de consulta</h2>');
  const p2Idx = html.indexOf('<p>Cada mujer...</p>');
  assert.ok(pIdx !== -1 && hIdx !== -1 && p2Idx !== -1, `missing expected fragments in html: ${html}`);
  assert.ok(pIdx < hIdx && hIdx < p2Idx, 'P → H2 → P order must be preserved in contentHtml');
});

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
