/**
 * fase3.test.js — Unit tests for Fase 3 edit tooling.
 *
 * Covers:
 *   - lib/editOps.js → discriminated-union schema validation
 *                    → each op's success path
 *                    → each op's miss / warning path
 *                    → invariants are NOT run inside applyEditsToContentJson
 *                      (that's the handler's job)
 *   - tools/pages.previewEdits.js
 *   - tools/pages.applyEdits.js
 *     including version_conflict snapshot, full-page-list payload, invariants
 *     enforcement, archived/trashed/brief rejection.
 *
 * Run with: node src/__tests__/fase3.test.js
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
// editOps — schema
// ──────────────────────────────────────────────────────────────────────────────

import {
  editOpSchema,
  editOpsArraySchema,
  applyEditsToContentJson,
  EDIT_OP_NAMES,
} from '../lib/editOps.js';

console.log('\nlib/editOps.js — schema');

await test('EDIT_OP_NAMES exposes the 12 v1 operations', () => {
  assert.deepEqual(
    [...EDIT_OP_NAMES].sort(),
    [
      'delete_section',
      'find_replace',
      'insert_cta',
      'insert_image_by_url',
      'insert_section',
      'replace_paragraph',
      'set_faq_answer',
      'set_faq_question',
      'set_heading_text',
      'set_page_name',
      'set_section_name',
      'set_seo_metadata',
    ].sort(),
  );
});

await test('set_seo_metadata schema accepts the 3 frontend-aligned keys', () => {
  const ok = editOpSchema.safeParse({
    op: 'set_seo_metadata',
    value: {
      titleTag: 'Hi',
      metaDescription: 'desc',
      urlSlug: 'hello-world',
    },
  });
  assert.ok(ok.success, 'should accept titleTag/metaDescription/urlSlug');
});

await test('set_seo_metadata schema rejects unknown keys (strict)', () => {
  // These were the v0 names — the frontend never used them, so we reject them
  // explicitly to keep the JSONB single-sourced.
  for (const badKey of ['title', 'description', 'ogImage', 'keywords', 'noindex']) {
    const r = editOpSchema.safeParse({
      op: 'set_seo_metadata',
      value: { [badKey]: 'x' },
    });
    assert.ok(!r.success, `should reject ${badKey}`);
  }
});

await test('set_seo_metadata merges into existing seoMetadata by default', () => {
  const r = applyEditsToContentJson({
    contentJson: { type: 'doc', content: [] },
    ops: [
      {
        op: 'set_seo_metadata',
        value: { titleTag: 'New title', metaDescription: 'desc' },
      },
    ],
    pageName: 'p',
    seoMetadata: { titleTag: 'Old title', urlSlug: 'kept-slug' },
    projectType: 'page',
  });
  assert.equal(r.seoMetadata.titleTag, 'New title');
  assert.equal(r.seoMetadata.metaDescription, 'desc');
  assert.equal(r.seoMetadata.urlSlug, 'kept-slug', 'pre-existing field should remain');
  assert.deepEqual(
    r.opsApplied[0].changedKeys.sort(),
    ['metaDescription', 'titleTag'].sort(),
  );
  assert.deepEqual(r.opsApplied[0].removedKeys, []);
});

await test('set_seo_metadata with merge=false replaces all fields', () => {
  const r = applyEditsToContentJson({
    contentJson: { type: 'doc', content: [] },
    ops: [
      { op: 'set_seo_metadata', merge: false, value: { titleTag: 'Only this' } },
    ],
    pageName: 'p',
    seoMetadata: { titleTag: 'Old', urlSlug: 'gone' },
    projectType: 'page',
  });
  assert.equal(r.seoMetadata.titleTag, 'Only this');
  assert.equal(r.seoMetadata.urlSlug, undefined, 'pre-existing field should be dropped');
  assert.ok(r.opsApplied[0].removedKeys.includes('urlSlug'));
});

await test('rejects an empty op list', () => {
  assert.ok(!editOpsArraySchema.safeParse([]).success);
});
await test('rejects an op list over 50 entries', () => {
  const ops = Array.from({ length: 51 }, () => ({ op: 'set_page_name', value: 'x' }));
  assert.ok(!editOpsArraySchema.safeParse(ops).success);
});
await test('rejects unknown op discriminator', () => {
  assert.ok(!editOpSchema.safeParse({ op: 'nope', value: 'x' }).success);
});
await test('rejects set_section_name without sectionId', () => {
  assert.ok(!editOpSchema.safeParse({ op: 'set_section_name', value: 'X' }).success);
});
await test('accepts find_replace with empty replace (delete)', () => {
  assert.ok(editOpSchema.safeParse({ op: 'find_replace', find: 'x', replace: '' }).success);
});

// ──────────────────────────────────────────────────────────────────────────────
// editOps — applyEditsToContentJson per-op behavior
// ──────────────────────────────────────────────────────────────────────────────

// Helper to build a fresh "page" doc with two sections.
function buildPageDoc() {
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
    ],
  };
}

function buildFaqDoc() {
  return {
    type: 'doc',
    content: [
      { type: 'sectionDivider', attrs: { sectionId: 'q-1', sectionName: 'Pregunta Frecuente 1' } },
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '¿Cómo me contacto?' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Por email.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'O por teléfono.' }] },
    ],
  };
}

console.log('\nlib/editOps.js — apply (per op)');

await test('set_page_name updates pageName, leaves doc untouched', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'set_page_name', value: 'Inicio' }],
    pageName: 'Old',
    projectType: 'page',
  });
  assert.equal(r.pageName, 'Inicio');
  assert.equal(r.opsApplied[0].matched, true);
  assert.equal(r.opsApplied[0].before, 'Old');
});

await test('set_section_name renames a sectionDivider by id', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'set_section_name', sectionId: 'sec-2', value: 'Detalles' }],
    pageName: 'p',
    projectType: 'page',
  });
  const sec2 = r.contentJson.content.find(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionId === 'sec-2',
  );
  assert.equal(sec2.attrs.sectionName, 'Detalles');
});

await test('set_section_name warns when sectionId not found', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'set_section_name', sectionId: 'missing', value: 'x' }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /sectionId missing not found/);
});

await test('set_heading_text scoped by sectionId + level', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      { op: 'set_heading_text', sectionId: 'sec-2', level: 2, value: 'Subtítulo nuevo' },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const sec2Heading = r.contentJson.content.find(
    (n) => n.type === 'heading' && n.content?.[0]?.text === 'Subtítulo nuevo',
  );
  assert.ok(sec2Heading);
  assert.equal(r.opsApplied[0].before, 'Sub');
});

await test('set_heading_text warns when no heading matches', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'set_heading_text', sectionId: 'sec-1', level: 6, value: 'x' }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
});

await test('replace_paragraph by paragraphIndex within section', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'replace_paragraph',
        sectionId: 'sec-1',
        paragraphIndex: 1,
        value: 'cuerpo DOS modificado',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const sec1Bodies = r.contentJson.content
    .filter((n) => n.type === 'paragraph')
    .map((n) => n.content?.[0]?.text);
  assert.ok(sec1Bodies.includes('cuerpo DOS modificado'));
  assert.ok(sec1Bodies.includes('cuerpo uno'));
});

await test('replace_paragraph by matchText', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'replace_paragraph',
        matchText: 'cuerpo uno',
        value: 'reemplazado',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const texts = r.contentJson.content
    .filter((n) => n.type === 'paragraph')
    .map((n) => n.content?.[0]?.text);
  assert.ok(texts.includes('reemplazado'));
});

await test('insert_section at end with heading + body', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_section',
        name: 'Sección 3',
        headingText: 'Tercer titulo',
        bodyText: 'Contenido nuevo.',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const dividers = r.contentJson.content.filter((n) => n.type === 'sectionDivider');
  assert.equal(dividers.length, 3);
  assert.equal(dividers[2].attrs.sectionName, 'Sección 3');

  // The new section's heading + paragraph should be after the new divider.
  const newDividerIdx = r.contentJson.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionName === 'Sección 3',
  );
  const headingAfter = r.contentJson.content[newDividerIdx + 1];
  assert.equal(headingAfter.type, 'heading');
  assert.equal(headingAfter.content[0].text, 'Tercer titulo');
});

await test('insert_section at position 0 prepends', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'insert_section', position: 0, headingText: 'Nuevo encabezado' }],
    pageName: 'p',
    projectType: 'page',
  });
  // First sectionDivider in result corresponds to the inserted one.
  const dividers = r.contentJson.content.filter((n) => n.type === 'sectionDivider');
  assert.equal(dividers.length, 3);
  // The inserted divider is now first.
  const firstDividerIdx = r.contentJson.content.findIndex((n) => n.type === 'sectionDivider');
  assert.equal(firstDividerIdx, 0);
  // The next node is the new heading.
  assert.equal(r.contentJson.content[1].type, 'heading');
  assert.equal(r.contentJson.content[1].content[0].text, 'Nuevo encabezado');
});

await test('delete_section removes the divider and its body', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'delete_section', sectionId: 'sec-1' }],
    pageName: 'p',
    projectType: 'page',
  });
  const dividers = r.contentJson.content.filter((n) => n.type === 'sectionDivider');
  assert.equal(dividers.length, 1);
  assert.equal(dividers[0].attrs.sectionId, 'sec-2');
  // The heading/paragraphs from sec-1 must be gone.
  const textBlobs = r.contentJson.content.flatMap(
    (n) => n.content?.map((c) => c.text ?? '') ?? [],
  );
  assert.ok(!textBlobs.includes('Hola'));
  assert.ok(!textBlobs.includes('cuerpo uno'));
});

await test('find_replace counts every occurrence (case-insensitive by default)', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'find_replace', find: 'cuerpo', replace: 'BODY' }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  assert.equal(r.opsApplied[0].replacements, 2);
  const texts = r.contentJson.content
    .filter((n) => n.type === 'paragraph')
    .map((n) => n.content?.[0]?.text);
  assert.ok(texts.includes('BODY uno'));
  assert.ok(texts.includes('BODY dos'));
});

await test('find_replace scoped by sectionId only touches that section', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      { op: 'find_replace', find: 'cuerpo', replace: 'X', sectionId: 'sec-1' },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].replacements, 2);
});

await test('find_replace warns when no matches', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'find_replace', find: 'NOMATCH', replace: 'x' }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /0 occurrences/);
});

await test('find_replace caseSensitive=true respects case', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'find_replace', find: 'CUERPO', replace: 'X', caseSensitive: true }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
});

await test('find_replace escapes regex metacharacters in find', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'sectionDivider', attrs: { sectionId: 's', sectionName: 'S' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'a.b (literal) c' }] },
    ],
  };
  const r = applyEditsToContentJson({
    contentJson: doc,
    ops: [{ op: 'find_replace', find: 'a.b', replace: 'X' }],
    pageName: 'p',
    projectType: 'page',
  });
  // 'a.b' should match the literal 3 chars, not regex 'a<any>b'. Only one match.
  assert.equal(r.opsApplied[0].replacements, 1);
});

await test('set_faq_question requires projectType=faq', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'set_faq_question', sectionId: 'sec-1', value: 'x' }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /requires projectType=faq/);
});

await test('set_faq_question updates the section heading text', () => {
  const r = applyEditsToContentJson({
    contentJson: buildFaqDoc(),
    ops: [{ op: 'set_faq_question', sectionId: 'q-1', value: '¿Otro contacto?' }],
    pageName: 'FAQ',
    projectType: 'faq',
  });
  const heading = r.contentJson.content.find((n) => n.type === 'heading');
  assert.equal(heading.content[0].text, '¿Otro contacto?');
});

await test('set_faq_answer collapses all paragraphs in section into one', () => {
  const r = applyEditsToContentJson({
    contentJson: buildFaqDoc(),
    ops: [{ op: 'set_faq_answer', sectionId: 'q-1', value: 'Por chat o por email.' }],
    pageName: 'FAQ',
    projectType: 'faq',
  });
  const paragraphs = r.contentJson.content.filter((n) => n.type === 'paragraph');
  assert.equal(paragraphs.length, 1);
  assert.equal(paragraphs[0].content[0].text, 'Por chat o por email.');
  assert.equal(r.opsApplied[0].paragraphsCollapsed, 2);
});

// ──────────────────────────────────────────────────────────────────────────────
// insert_cta + insert_image_by_url — schema + apply
// ──────────────────────────────────────────────────────────────────────────────

await test('rejects insert_cta without sectionId', () => {
  assert.ok(
    !editOpSchema.safeParse({
      op: 'insert_cta',
      ctaText: 'Empezar',
      ctaUrl: 'https://x.com',
    }).success,
  );
});

await test('rejects insert_cta with empty ctaText', () => {
  assert.ok(
    !editOpSchema.safeParse({
      op: 'insert_cta',
      sectionId: 'sec-1',
      ctaText: '',
      ctaUrl: 'https://x.com',
    }).success,
  );
});

await test('rejects insert_cta with empty ctaUrl', () => {
  assert.ok(
    !editOpSchema.safeParse({
      op: 'insert_cta',
      sectionId: 'sec-1',
      ctaText: 'X',
      ctaUrl: '',
    }).success,
  );
});

await test('rejects insert_image_by_url without sectionId or src', () => {
  assert.ok(!editOpSchema.safeParse({ op: 'insert_image_by_url', src: 'x' }).success);
  assert.ok(
    !editOpSchema.safeParse({ op: 'insert_image_by_url', sectionId: 'sec-1', src: '' }).success,
  );
});

await test('insert_cta appends a ctaButton at end of section body', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_cta',
        sectionId: 'sec-1',
        ctaText: 'Bienvenido mundo',
        ctaUrl: 'https://webrief.app',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  assert.equal(r.opsApplied[0].sectionId, 'sec-1');
  // sec-1 body is content[1..3] (heading + 2 paragraphs); divider for sec-2 is at index 4.
  // After insert, the ctaButton should be at index 4 (immediately before sec-2 divider).
  const sec2DividerIdx = r.contentJson.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionId === 'sec-2',
  );
  const ctaNode = r.contentJson.content[sec2DividerIdx - 1];
  assert.equal(ctaNode.type, 'ctaButton');
  assert.equal(ctaNode.attrs.ctaText, 'Bienvenido mundo');
  assert.equal(ctaNode.attrs.ctaUrl, 'https://webrief.app');
});

await test('insert_cta with position=0 inserts at start of section body', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_cta',
        sectionId: 'sec-2',
        position: 0,
        ctaText: 'Ver más',
        ctaUrl: 'https://x.com',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const sec2DividerIdx = r.contentJson.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionId === 'sec-2',
  );
  const afterDivider = r.contentJson.content[sec2DividerIdx + 1];
  assert.equal(afterDivider.type, 'ctaButton');
  assert.equal(afterDivider.attrs.ctaText, 'Ver más');
});

await test('insert_cta warns when sectionId not found', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_cta',
        sectionId: 'missing',
        ctaText: 'X',
        ctaUrl: 'https://x.com',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /sectionId missing not found/);
});

await test('insert_image_by_url appends an image node at end of section body', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_image_by_url',
        sectionId: 'sec-1',
        src: 'https://ik.imagekit.io/x/hero.jpg',
        alt: 'Hero',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  assert.equal(r.opsApplied[0].src, 'https://ik.imagekit.io/x/hero.jpg');
  assert.equal(r.opsApplied[0].alt, 'Hero');
  const sec2DividerIdx = r.contentJson.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionId === 'sec-2',
  );
  const imgNode = r.contentJson.content[sec2DividerIdx - 1];
  assert.equal(imgNode.type, 'image');
  assert.equal(imgNode.attrs.src, 'https://ik.imagekit.io/x/hero.jpg');
  assert.equal(imgNode.attrs.alt, 'Hero');
});

await test('insert_image_by_url without alt records alt=null in summary', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_image_by_url',
        sectionId: 'sec-2',
        src: 'https://ik.imagekit.io/x/photo.png',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  assert.equal(r.opsApplied[0].alt, null);
  // alt attr is omitted when not provided.
  const imgNode = r.contentJson.content.find((n) => n.type === 'image');
  assert.ok(imgNode);
  assert.equal('alt' in imgNode.attrs, false);
});

await test('insert_image_by_url warns when sectionId not found', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_image_by_url',
        sectionId: 'nope',
        src: 'https://ik.imagekit.io/x/y.jpg',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /sectionId nope not found/);
});

await test('insert_cta + insert_image_by_url survive ensureInvariants', async () => {
  const { ensureInvariants } = await import(
    '../../../../shared/documentInvariants.js'
  );
  const edited = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_cta',
        sectionId: 'sec-1',
        ctaText: 'Empezar',
        ctaUrl: 'https://webrief.app',
      },
      {
        op: 'insert_image_by_url',
        sectionId: 'sec-1',
        position: 0,
        src: 'https://ik.imagekit.io/x/hero.jpg',
        alt: 'Hero',
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const normalized = ensureInvariants(edited.contentJson, 'page');
  // Repair shouldn't have changed attrs of well-formed nodes.
  const cta = normalized.contentJson.content.find((n) => n.type === 'ctaButton');
  assert.ok(cta, 'ctaButton must survive ensureInvariants');
  assert.equal(cta.attrs.ctaText, 'Empezar');
  assert.equal(cta.attrs.ctaUrl, 'https://webrief.app');
  const img = normalized.contentJson.content.find((n) => n.type === 'image');
  assert.ok(img, 'image node must survive ensureInvariants');
  assert.equal(img.attrs.src, 'https://ik.imagekit.io/x/hero.jpg');
  // CTA repair shouldn't have logged any defaults.
  assert.equal(
    normalized.repairs.some((r) => /CTA node/.test(r)),
    false,
  );
  // HTML output should embed both nodes.
  assert.match(normalized.contentHtml, /data-cta-button/);
  assert.match(normalized.contentHtml, /data-cta-text="Empezar"/);
  assert.match(normalized.contentHtml, /<img[^>]+src="https:\/\/ik\.imagekit\.io\/x\/hero\.jpg"/);
});

await test('multiple ops applied in order', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      { op: 'set_page_name', value: 'Nueva' },
      { op: 'set_heading_text', sectionId: 'sec-1', level: 1, value: 'Adiós' },
      { op: 'find_replace', find: 'mundo', replace: 'planeta' },
    ],
    pageName: 'old',
    projectType: 'page',
  });
  assert.equal(r.opsApplied.length, 3);
  assert.equal(r.pageName, 'Nueva');
  const h1 = r.contentJson.content.find(
    (n) => n.type === 'heading' && n.attrs?.level === 1,
  );
  assert.equal(h1.content[0].text, 'Adiós');
  const allText = r.contentJson.content
    .flatMap((n) => n.content?.map((c) => c.text ?? '') ?? [])
    .join(' ');
  assert.ok(allText.includes('planeta'));
});

// ──────────────────────────────────────────────────────────────────────────────
// Handler tests — pages.previewEdits + pages.applyEdits with mocked fetch
// ──────────────────────────────────────────────────────────────────────────────

const BACKEND_BASE = 'http://localhost:3000/api';
const TEST_MCP_TOKEN = 'test-fixture-not-a-real-token-fase3';
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
    // Route key can be exact URL or "METHOD URL".
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

import * as pagesPreviewEdits from '../tools/pages.previewEdits.js';
import * as pagesApplyEdits from '../tools/pages.applyEdits.js';

const PROJECT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PAGE_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_PAGE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildProjectResponse(overrides = {}) {
  return {
    project: {
      id: PROJECT_ID,
      name: 'P',
      projectType: 'page',
      companyId: 'co',
      ...(overrides.project ?? {}),
    },
    pages: overrides.pages ?? [
      {
        id: PAGE_ID,
        name: 'Inicio',
        position: 0,
        version: 4,
        reviewStatus: 'draft',
        contentJson: buildPageDoc(),
        contentHtml: '<p>old html</p>',
      },
      {
        id: OTHER_PAGE_ID,
        name: 'Contacto',
        position: 1,
        version: 1,
        reviewStatus: 'draft',
        contentJson: {
          type: 'doc',
          content: [
            { type: 'sectionDivider', attrs: { sectionId: 'sx', sectionName: 'Sección 1' } },
            { type: 'paragraph', content: [{ type: 'text', text: 'otra' }] },
          ],
        },
        contentHtml: '<p>otra</p>',
      },
    ],
  };
}

console.log('\npages.previewEdits — handler');

await test('returns previewId + normalized contentJson + opsApplied', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: buildProjectResponse() },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesPreviewEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      edits: [
        { op: 'set_page_name', value: 'Página principal' },
        { op: 'set_heading_text', sectionId: 'sec-1', level: 1, value: 'Bienvenido' },
      ],
    });
    assert.equal(r.status, 'ok');
    assert.ok(r.previewId.startsWith('prev_'));
    assert.equal(r.page.name, 'Página principal');
    assert.equal(r.opsApplied.length, 2);
    assert.ok(r.page.contentHtml.includes('Bienvenido'));
  });
});

await test('rejects projectType=brief', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: buildProjectResponse({ project: { projectType: 'brief' } }),
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesPreviewEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      edits: [{ op: 'set_page_name', value: 'x' }],
    });
    assertStructuredError(r, 'invalid_project_type');
  });
});

await test('returns page_not_found for missing pageId', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: buildProjectResponse() },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesPreviewEdits.handler({
      projectId: PROJECT_ID,
      pageId: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
      edits: [{ op: 'set_page_name', value: 'x' }],
    });
    assertStructuredError(r, 'page_not_found');
  });
});

await test('rejects archived project', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: buildProjectResponse({
        project: { archivedAt: '2026-01-01T00:00:00Z' },
      }),
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesPreviewEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      edits: [{ op: 'set_page_name', value: 'x' }],
    });
    assertStructuredError(r, 'project_not_mutable');
  });
});

console.log('\npages.applyEdits — handler');

await test('happy path: PUT receives every page with the target modified', async () => {
  const SAVED_VERSION = 5;
  const routes = {
    [`GET ${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: buildProjectResponse() },
    [`PUT ${BACKEND_BASE}/projects/${PROJECT_ID}/pages`]: {
      body: {
        pages: [
          { id: PAGE_ID, name: 'Página principal', version: SAVED_VERSION, reviewStatus: 'draft', updatedAt: '2026-05-21T10:00:00Z' },
          { id: OTHER_PAGE_ID, name: 'Contacto', version: 2, reviewStatus: 'draft' },
        ],
      },
    },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesApplyEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      expectedVersion: 4,
      edits: [{ op: 'set_page_name', value: 'Página principal' }],
    });

    assert.equal(r.status, 'ok');
    assert.equal(r.page.version, SAVED_VERSION);
    assert.equal(r.page.name, 'Página principal');

    // Verify the PUT payload had ALL pages, not just the edited one.
    const putCall = calls.find((c) => c.method === 'PUT');
    assert.ok(putCall, 'expected a PUT call');
    const body = JSON.parse(putCall.options.body);
    assert.equal(body.source, 'mcp');
    assert.equal(body.pages.length, 2);
    const idsInPayload = body.pages.map((p) => p.id).sort();
    assert.deepEqual(idsInPayload, [PAGE_ID, OTHER_PAGE_ID].sort());
    // Target page gets the new name
    const targetInPayload = body.pages.find((p) => p.id === PAGE_ID);
    assert.equal(targetInPayload.name, 'Página principal');
    // Other page stays as-is
    const otherInPayload = body.pages.find((p) => p.id === OTHER_PAGE_ID);
    assert.equal(otherInPayload.name, 'Contacto');
  });
});

await test('set_seo_metadata persisted: PUT payload carries the new seoMetadata for target page only', async () => {
  const SAVED_VERSION = 5;
  const projectResp = buildProjectResponse();
  // Pre-seed an existing SEO field on the target page (frontend-style key).
  projectResp.pages[0].seoMetadata = { urlSlug: 'keep-this-slug' };
  // And on the OTHER page so we can prove we don't disturb it.
  projectResp.pages[1].seoMetadata = { titleTag: 'untouched' };

  const routes = {
    [`GET ${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: projectResp },
    [`PUT ${BACKEND_BASE}/projects/${PROJECT_ID}/pages`]: {
      body: {
        pages: [
          { id: PAGE_ID, name: 'p', version: SAVED_VERSION, reviewStatus: 'draft' },
          { id: OTHER_PAGE_ID, name: 'c', version: 2, reviewStatus: 'draft' },
        ],
      },
    },
  };

  await withMockedFetch(routes, async (calls) => {
    const r = await pagesApplyEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      expectedVersion: 4,
      edits: [
        {
          op: 'set_seo_metadata',
          value: { titleTag: 'SEO title', metaDescription: 'SEO desc' },
        },
      ],
    });
    assert.equal(r.status, 'ok');

    const putCall = calls.find((c) => c.method === 'PUT');
    const body = JSON.parse(putCall.options.body);

    const target = body.pages.find((p) => p.id === PAGE_ID);
    assert.equal(target.seoMetadata.titleTag, 'SEO title');
    assert.equal(target.seoMetadata.metaDescription, 'SEO desc');
    assert.equal(target.seoMetadata.urlSlug, 'keep-this-slug', 'merge preserves pre-existing');

    const other = body.pages.find((p) => p.id === OTHER_PAGE_ID);
    assert.equal(other.seoMetadata.titleTag, 'untouched', 'other page seoMetadata untouched');
  });
});

await test('returns version_conflict + snapshot when expectedVersion is stale', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: buildProjectResponse() },
  };
  await withMockedFetch(routes, async (calls) => {
    const r = await pagesApplyEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      expectedVersion: 3, // stale (server has 4)
      edits: [{ op: 'set_page_name', value: 'x' }],
    });
    assertStructuredError(r, 'version_conflict');
    assert.equal(r.error.currentVersion, 4);
    assert.equal(r.error.currentSnapshot.id, PAGE_ID);
    assert.equal(r.error.currentSnapshot.version, 4);
    assert.ok(r.error.currentSnapshot.contentJson);
    // No PUT should have been issued.
    const putCall = calls.find((c) => c.method === 'PUT');
    assert.equal(putCall, undefined, 'must not PUT on version conflict');
  });
});

await test('forwards backend 409 as version_conflict if it slips through', async () => {
  const routes = {
    [`GET ${BACKEND_BASE}/projects/${PROJECT_ID}`]: { body: buildProjectResponse() },
    [`PUT ${BACKEND_BASE}/projects/${PROJECT_ID}/pages`]: {
      ok: false,
      status: 409,
      body: { error: 'conflict', pageId: PAGE_ID },
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesApplyEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      expectedVersion: 4,
      edits: [{ op: 'set_page_name', value: 'x' }],
    });
    assertStructuredError(r, 'version_conflict');
    assert.equal(r.error.backendStatus, 409);
    assert.equal(r.error.affectedPageId, PAGE_ID);
  });
});

await test('rejects projectType=brief', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: buildProjectResponse({ project: { projectType: 'brief' } }),
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesApplyEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      expectedVersion: 4,
      edits: [{ op: 'set_page_name', value: 'x' }],
    });
    assertStructuredError(r, 'invalid_project_type');
  });
});

await test('rejects trashed project', async () => {
  const routes = {
    [`${BACKEND_BASE}/projects/${PROJECT_ID}`]: {
      body: buildProjectResponse({
        project: { trashedAt: '2026-01-01T00:00:00Z' },
      }),
    },
  };
  await withMockedFetch(routes, async () => {
    const r = await pagesApplyEdits.handler({
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      expectedVersion: 4,
      edits: [{ op: 'set_page_name', value: 'x' }],
    });
    assertStructuredError(r, 'project_not_mutable');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// mcp_token_missing on both Fase 3 handlers
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nFase 3 handlers — mcp_token_missing error path');

const savedToken = process.env.WEBRIEF_MCP_TOKEN;
delete process.env.WEBRIEF_MCP_TOKEN;

await test('pages.previewEdits returns mcp_token_missing', async () => {
  const r = await pagesPreviewEdits.handler({
    projectId: PROJECT_ID,
    pageId: PAGE_ID,
    edits: [{ op: 'set_page_name', value: 'x' }],
  });
  assertStructuredError(r, 'mcp_token_missing');
});

await test('pages.applyEdits returns mcp_token_missing', async () => {
  const r = await pagesApplyEdits.handler({
    projectId: PROJECT_ID,
    pageId: PAGE_ID,
    expectedVersion: 1,
    edits: [{ op: 'set_page_name', value: 'x' }],
  });
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
