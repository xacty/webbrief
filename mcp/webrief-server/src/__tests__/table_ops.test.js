/**
 * table_ops.test.js — Unit tests for the 4 table edit ops added to
 * lib/editOps.js: insert_table / replace_table / set_table_cell / delete_table.
 *
 * Covers:
 *   - tableRows schema limits (rows/cols/cell length) shared by insert_table
 *     and replace_table
 *   - tableIndex must be >= 0 on the ops that carry it
 *   - insert_table: section scoping, headerRow true/false, no-sectionId
 *     (append at doc end), missing sectionId, uneven row padding + warning
 *   - replace_table: index-scoped replace among multiple tables, out-of-range
 *     tableIndex
 *   - set_table_cell: text change, tableHeader vs tableCell preserved,
 *     neighbor cells untouched, out-of-range row/col
 *   - delete_table: correct table removed by index, section scoping
 *   - end-to-end through ensureInvariants for both 'page' and 'document'
 *     project types (HTML has <table>/<th>/<td>)
 *   - dispatcher regression: `summary.warning` collection change
 *     (`!summary.matched && summary.warning` → `summary.warning`) must not
 *     introduce spurious warnings for the pre-existing 12 ops.
 *
 * Run with: node src/__tests__/table_ops.test.js
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

import { editOpSchema, applyEditsToContentJson } from '../lib/editOps.js';

// ──────────────────────────────────────────────────────────────────────────────
// Fixtures
// ──────────────────────────────────────────────────────────────────────────────

// Doc with 2 sections, no tables yet (mirrors fase3.test.js buildPageDoc).
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

// document-type doc: linear, no sectionDividers.
function buildDocumentDoc() {
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Título' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Intro' }] },
    ],
  };
}

function tableNodeAt(doc, idx) {
  return doc.content[idx];
}

function findAllTables(doc) {
  return doc.content
    .map((n, index) => ({ n, index }))
    .filter(({ n }) => n.type === 'table');
}

// ──────────────────────────────────────────────────────────────────────────────
// Schema
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — table ops schema');

await test('insert_table accepts a 2x2 rows array with headerRow', () => {
  const r = editOpSchema.safeParse({
    op: 'insert_table',
    sectionId: 'sec-1',
    headerRow: true,
    rows: [
      ['Header A', 'Header B'],
      ['r1c1', 'r1c2'],
    ],
  });
  assert.ok(r.success, JSON.stringify(r.error?.issues));
});

await test('insert_table rejects an empty rows array', () => {
  const r = editOpSchema.safeParse({ op: 'insert_table', rows: [] });
  assert.ok(!r.success);
});

await test('insert_table rejects more than 50 rows', () => {
  const rows = Array.from({ length: 51 }, () => ['x']);
  const r = editOpSchema.safeParse({ op: 'insert_table', rows });
  assert.ok(!r.success);
});

await test('insert_table rejects more than 12 columns in a row', () => {
  const rows = [Array.from({ length: 13 }, (_, i) => `c${i}`)];
  const r = editOpSchema.safeParse({ op: 'insert_table', rows });
  assert.ok(!r.success);
});

await test('insert_table rejects a cell longer than 2000 chars', () => {
  const rows = [['x'.repeat(2001)]];
  const r = editOpSchema.safeParse({ op: 'insert_table', rows });
  assert.ok(!r.success);
});

await test('replace_table / set_table_cell / delete_table reject negative tableIndex', () => {
  assert.ok(
    !editOpSchema.safeParse({
      op: 'replace_table',
      tableIndex: -1,
      rows: [['a']],
    }).success,
  );
  assert.ok(
    !editOpSchema.safeParse({
      op: 'set_table_cell',
      tableIndex: -1,
      rowIndex: 0,
      colIndex: 0,
      text: 'x',
    }).success,
  );
  assert.ok(
    !editOpSchema.safeParse({
      op: 'delete_table',
      tableIndex: -1,
    }).success,
  );
});

await test('set_table_cell rejects negative rowIndex/colIndex', () => {
  assert.ok(
    !editOpSchema.safeParse({
      op: 'set_table_cell',
      rowIndex: -1,
      colIndex: 0,
      text: 'x',
    }).success,
  );
  assert.ok(
    !editOpSchema.safeParse({
      op: 'set_table_cell',
      rowIndex: 0,
      colIndex: -1,
      text: 'x',
    }).success,
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// insert_table
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — insert_table');

await test('insert_table with sectionId places the table inside that section, before the next divider', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_table',
        sectionId: 'sec-1',
        rows: [
          ['Header A', 'Header B'],
          ['r1c1', 'r1c2'],
        ],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);

  const doc = r.contentJson;
  const sec2DividerIdx = doc.content.findIndex(
    (n) => n.type === 'sectionDivider' && n.attrs.sectionId === 'sec-2',
  );
  const tableIdx = sec2DividerIdx - 1;
  const table = doc.content[tableIdx];
  assert.equal(table.type, 'table');
  // First row: tableHeader cells (headerRow defaults to true).
  const row0 = table.content[0];
  assert.equal(row0.type, 'tableRow');
  assert.ok(row0.content.every((c) => c.type === 'tableHeader'));
  assert.equal(row0.content[0].content[0].type, 'paragraph');
  assert.equal(row0.content[0].content[0].content[0].text, 'Header A');
  // Second row: tableCell cells.
  const row1 = table.content[1];
  assert.ok(row1.content.every((c) => c.type === 'tableCell'));
  assert.equal(row1.content[0].content[0].content[0].text, 'r1c1');
});

await test('insert_table headerRow:false makes every row tableCell', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_table',
        sectionId: 'sec-1',
        headerRow: false,
        rows: [
          ['a', 'b'],
          ['c', 'd'],
        ],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const table = findAllTables(r.contentJson)[0].n;
  for (const row of table.content) {
    assert.ok(row.content.every((c) => c.type === 'tableCell'), 'every cell should be tableCell');
  }
});

await test('insert_table without sectionId appends at the end of the doc', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [{ op: 'insert_table', rows: [['x', 'y']] }],
    pageName: 'p',
    projectType: 'page',
  });
  const last = r.contentJson.content[r.contentJson.content.length - 1];
  assert.equal(last.type, 'table');
});

await test('insert_table with unknown sectionId warns and leaves doc intact', () => {
  const before = buildPageDoc();
  const r = applyEditsToContentJson({
    contentJson: before,
    ops: [{ op: 'insert_table', sectionId: 'nope', rows: [['x']] }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /sectionId nope not found/);
  assert.deepEqual(r.contentJson.content, before.content);
});

await test('insert_table pads uneven rows to the widest row width and records a warning', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_table',
        rows: [
          ['A', 'B', 'C'],
          ['x'],
        ],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const table = findAllTables(r.contentJson)[0].n;
  for (const row of table.content) {
    assert.equal(row.content.length, 3, 'every row should be padded to 3 cols');
  }
  // Padded cells should be empty paragraphs.
  const paddedCell = table.content[1].content[1];
  assert.equal(paddedCell.content[0].content ?? undefined, undefined);
  assert.ok(
    r.warnings.some((w) => /uneven column counts/.test(w)),
    `expected a padding warning, got: ${JSON.stringify(r.warnings)}`,
  );
  assert.equal(r.opsApplied[0].matched, true, 'op still matches even though padded');
});

// ──────────────────────────────────────────────────────────────────────────────
// replace_table
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — replace_table');

function buildDocWithTwoTablesInOneSection() {
  return {
    type: 'doc',
    content: [
      { type: 'sectionDivider', attrs: { sectionId: 'sec-1', sectionName: 'Sección 1' } },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first-A' }] }] },
            ],
          },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'entre tablas' }] },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second-A' }] }] },
            ],
          },
        ],
      },
    ],
  };
}

await test('replace_table tableIndex:1 replaces only the second table', () => {
  const r = applyEditsToContentJson({
    contentJson: buildDocWithTwoTablesInOneSection(),
    ops: [
      {
        op: 'replace_table',
        sectionId: 'sec-1',
        tableIndex: 1,
        rows: [['replaced']],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  const tables = findAllTables(r.contentJson);
  assert.equal(tables.length, 2);
  // First table untouched.
  assert.equal(tables[0].n.content[0].content[0].content[0].content[0].text, 'first-A');
  // Second table replaced.
  assert.equal(tables[1].n.content[0].content[0].content[0].content[0].text, 'replaced');
});

await test('replace_table with out-of-range tableIndex warns and leaves doc intact', () => {
  const before = buildDocWithTwoTablesInOneSection();
  const r = applyEditsToContentJson({
    contentJson: before,
    ops: [
      {
        op: 'replace_table',
        sectionId: 'sec-1',
        tableIndex: 5,
        rows: [['x']],
      },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /tableIndex 5 not found/);
  assert.deepEqual(r.contentJson.content, before.content);
});

// ──────────────────────────────────────────────────────────────────────────────
// set_table_cell
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — set_table_cell');

function buildDocWithOneTable({ headerRow = true } = {}) {
  const cell = (text, isHeader) => ({
    type: isHeader ? 'tableHeader' : 'tableCell',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  });
  return {
    type: 'doc',
    content: [
      { type: 'sectionDivider', attrs: { sectionId: 'sec-1', sectionName: 'Sección 1' } },
      {
        type: 'table',
        content: [
          { type: 'tableRow', content: [cell('h0', headerRow), cell('h1', headerRow), cell('h2', headerRow)] },
          { type: 'tableRow', content: [cell('r1c0', false), cell('r1c1', false), cell('r1c2', false)] },
          { type: 'tableRow', content: [cell('r2c0', false), cell('r2c1', false), cell('r2c2', false)] },
        ],
      },
    ],
  };
}

await test('set_table_cell changes the text of cell [1][2], preserves node type, leaves neighbors intact', () => {
  const r = applyEditsToContentJson({
    contentJson: buildDocWithOneTable(),
    ops: [
      { op: 'set_table_cell', sectionId: 'sec-1', rowIndex: 1, colIndex: 2, text: 'edited' },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  assert.equal(r.opsApplied[0].before, 'r1c2');
  assert.equal(r.opsApplied[0].after, 'edited');

  const table = findAllTables(r.contentJson)[0].n;
  const editedCell = table.content[1].content[2];
  assert.equal(editedCell.type, 'tableCell', 'non-header cell type preserved');
  assert.equal(editedCell.content[0].content[0].text, 'edited');
  // Neighbors untouched.
  assert.equal(table.content[1].content[0].content[0].content[0].text, 'r1c0');
  assert.equal(table.content[1].content[1].content[0].content[0].text, 'r1c1');
  assert.equal(table.content[0].content[2].content[0].content[0].text, 'h2');
  assert.equal(table.content[2].content[2].content[0].content[0].text, 'r2c2');
});

await test('set_table_cell on a header cell [0][x] stays tableHeader', () => {
  const r = applyEditsToContentJson({
    contentJson: buildDocWithOneTable(),
    ops: [
      { op: 'set_table_cell', sectionId: 'sec-1', rowIndex: 0, colIndex: 1, text: 'new header' },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  const table = findAllTables(r.contentJson)[0].n;
  const cell = table.content[0].content[1];
  assert.equal(cell.type, 'tableHeader');
  assert.equal(cell.content[0].content[0].text, 'new header');
});

await test('set_table_cell warns on out-of-range rowIndex', () => {
  const before = buildDocWithOneTable();
  const r = applyEditsToContentJson({
    contentJson: before,
    ops: [{ op: 'set_table_cell', sectionId: 'sec-1', rowIndex: 99, colIndex: 0, text: 'x' }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /rowIndex 99 not found/);
  assert.deepEqual(r.contentJson.content, before.content);
});

await test('set_table_cell warns on out-of-range colIndex', () => {
  const before = buildDocWithOneTable();
  const r = applyEditsToContentJson({
    contentJson: before,
    ops: [{ op: 'set_table_cell', sectionId: 'sec-1', rowIndex: 0, colIndex: 99, text: 'x' }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /colIndex 99 not found/);
  assert.deepEqual(r.contentJson.content, before.content);
});

// ──────────────────────────────────────────────────────────────────────────────
// delete_table
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nlib/editOps.js — delete_table');

await test('delete_table removes the correct table by tableIndex, leaves the rest of the section intact', () => {
  const r = applyEditsToContentJson({
    contentJson: buildDocWithTwoTablesInOneSection(),
    ops: [{ op: 'delete_table', sectionId: 'sec-1', tableIndex: 0 }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  const tables = findAllTables(r.contentJson);
  assert.equal(tables.length, 1);
  // The remaining table is the one that was 'second-A'.
  assert.equal(tables[0].n.content[0].content[0].content[0].content[0].text, 'second-A');
  // The paragraph 'entre tablas' should still be present.
  const texts = r.contentJson.content
    .filter((n) => n.type === 'paragraph')
    .map((n) => n.content?.[0]?.text);
  assert.ok(texts.includes('entre tablas'));
});

await test('delete_table is scoped to the section: deleting sec-2 table-0 does not touch sec-1 table', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'sectionDivider', attrs: { sectionId: 'sec-1', sectionName: 'Sección 1' } },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'sec1-table' }] }] }],
          },
        ],
      },
      { type: 'sectionDivider', attrs: { sectionId: 'sec-2', sectionName: 'Sección 2' } },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'sec2-table' }] }] }],
          },
        ],
      },
    ],
  };
  const r = applyEditsToContentJson({
    contentJson: doc,
    ops: [{ op: 'delete_table', sectionId: 'sec-2', tableIndex: 0 }],
    pageName: 'p',
    projectType: 'page',
  });
  const tables = findAllTables(r.contentJson);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].n.content[0].content[0].content[0].content[0].text, 'sec1-table');
  // sec-1 divider must still be present.
  assert.ok(r.contentJson.content.some((n) => n.type === 'sectionDivider' && n.attrs.sectionId === 'sec-1'));
  // sec-2 divider must still be present (only the table inside it was removed).
  assert.ok(r.contentJson.content.some((n) => n.type === 'sectionDivider' && n.attrs.sectionId === 'sec-2'));
});

await test('delete_table with out-of-range tableIndex warns and leaves doc intact', () => {
  const before = buildDocWithOneTable();
  const r = applyEditsToContentJson({
    contentJson: before,
    ops: [{ op: 'delete_table', sectionId: 'sec-1', tableIndex: 4 }],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, false);
  assert.match(r.warnings[0], /tableIndex 4 not found/);
  assert.deepEqual(r.contentJson.content, before.content);
});

// ──────────────────────────────────────────────────────────────────────────────
// Integration end-to-end: apply → ensureInvariants → HTML shape
// ──────────────────────────────────────────────────────────────────────────────

console.log('\nintegration — table ops through ensureInvariants');

await test('page-type doc: insert_table + set_table_cell survive ensureInvariants and render <table>/<th>/<td>', async () => {
  const { ensureInvariants } = await import('../../../../shared/documentInvariants.js');

  const edited = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      {
        op: 'insert_table',
        sectionId: 'sec-1',
        rows: [
          ['Header A', 'Header B'],
          ['r1c1', 'r1c2'],
        ],
      },
      { op: 'set_table_cell', sectionId: 'sec-1', rowIndex: 1, colIndex: 1, text: 'edited-cell' },
    ],
    pageName: 'p',
    projectType: 'page',
  });

  const normalized = ensureInvariants(edited.contentJson, 'page');
  assert.match(normalized.contentHtml, /<table/);
  assert.match(normalized.contentHtml, /<th/);
  assert.match(normalized.contentHtml, /<td/);
  assert.match(normalized.contentHtml, /edited-cell/);
});

await test('document-type doc (no dividers): insert_table + set_table_cell survive ensureInvariants and render <table>/<th>/<td>', async () => {
  const { ensureInvariants } = await import('../../../../shared/documentInvariants.js');

  const edited = applyEditsToContentJson({
    contentJson: buildDocumentDoc(),
    ops: [
      {
        op: 'insert_table',
        rows: [
          ['Header A', 'Header B'],
          ['r1c1', 'r1c2'],
        ],
      },
      { op: 'set_table_cell', rowIndex: 1, colIndex: 0, text: 'doc-edited-cell' },
    ],
    pageName: 'p',
    projectType: 'document',
  });

  const normalized = ensureInvariants(edited.contentJson, 'document');
  assert.match(normalized.contentHtml, /<table/);
  assert.match(normalized.contentHtml, /<th/);
  assert.match(normalized.contentHtml, /<td/);
  assert.match(normalized.contentHtml, /doc-edited-cell/);
});

// ──────────────────────────────────────────────────────────────────────────────
// Dispatcher regression: `summary.warning` collection change
// (`!summary.matched && summary.warning` → `summary.warning`) must not
// introduce spurious warnings for pre-existing ops that match cleanly.
// ──────────────────────────────────────────────────────────────────────────────

console.log('\ndispatcher regression — matched ops with no warning field stay warning-free');

await test('a clean batch of pre-existing ops (set_heading_text + replace_paragraph) produces zero warnings', () => {
  const r = applyEditsToContentJson({
    contentJson: buildPageDoc(),
    ops: [
      { op: 'set_heading_text', sectionId: 'sec-1', level: 1, value: 'Nuevo título' },
      { op: 'replace_paragraph', sectionId: 'sec-1', paragraphIndex: 0, value: 'Nuevo cuerpo' },
    ],
    pageName: 'p',
    projectType: 'page',
  });
  assert.equal(r.opsApplied[0].matched, true);
  assert.equal(r.opsApplied[1].matched, true);
  assert.deepEqual(r.warnings, [], `expected no warnings, got: ${JSON.stringify(r.warnings)}`);
});

// ──────────────────────────────────────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
