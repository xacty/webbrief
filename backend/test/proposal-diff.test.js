import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffProposalSections, summarizeProposalDiff } from '../../frontend/src/lib/proposalDiff.js'

// Helper local: serializa un divider igual que ProjectEditor.jsx (mismo helper
// que backend/test/section-merge.test.js).
const d = (id, name) => `<div data-section-divider data-section-id="${id}" data-section-name="${name}"></div>`
const published = `${d('a', 'Uno')}<p>alfa</p>${d('b', 'Dos')}<p>beta</p>`

// -------- 1. Sin cambios --------

test('propuesta idéntica a lo publicado: todo unchanged, hasChanges false', () => {
  const result = diffProposalSections(published, published)
  assert.equal(result.hasChanges, false)
  assert.equal(result.totalChanges, 0)
  assert.deepEqual(result.counts, { added: 0, changed: 0, removed: 0, unchanged: 2 })
  assert.deepEqual(result.sections.map((s) => s.status), ['unchanged', 'unchanged'])
})

test('diferencias cosméticas de serialización no cuentan como cambio', () => {
  // Mismo contenido, atributos en otro orden y espacios sobrantes — es lo que
  // pasa cuando el HTML lo re-emite editor.getHTML() en vez del guardado crudo.
  const proposal = `${d('a', 'Uno')}<p>alfa</p>${d('b', 'Dos')}  <p>beta</p>`
  const result = diffProposalSections(published, proposal)
  assert.equal(result.hasChanges, false)
})

// -------- 2. Sección modificada --------

test('contenido distinto en una sección: status changed y el resto intacto', () => {
  const proposal = `${d('a', 'Uno')}<p>alfa</p>${d('b', 'Dos')}<p>beta reescrita</p>`
  const result = diffProposalSections(published, proposal)
  assert.deepEqual(result.counts, { added: 0, changed: 1, removed: 0, unchanged: 1 })
  assert.equal(result.sections[1].status, 'changed')
  assert.equal(result.sections[1].innerHtml, '<p>beta reescrita</p>')
  assert.equal(result.totalChanges, 1)
})

test('imagen agregada a una sección cuenta como changed (el caso Tlalpan)', () => {
  const img = '<img src="https://ik.imagekit.io/webrief/c/p/x-IMG_2542.webp" alt="IMG_2542.webp">'
  const proposal = `${d('a', 'Uno')}<p>alfa</p>${d('b', 'Dos')}<p>beta</p>${img}`
  const result = diffProposalSections(published, proposal)
  assert.equal(result.counts.changed, 1)
  assert.equal(result.sections[1].status, 'changed')
})

// -------- 3. Rename --------

test('rename de sección sin tocar contenido: changed + renamedFrom con el nombre viejo', () => {
  const proposal = `${d('a', 'Uno')}<p>alfa</p>${d('b', 'Dos bis')}<p>beta</p>`
  const result = diffProposalSections(published, proposal)
  assert.equal(result.sections[1].status, 'changed')
  assert.equal(result.sections[1].renamedFrom, 'Dos')
  assert.equal(result.sections[0].renamedFrom, null)
})

// -------- 4. Alta y baja de secciones --------

test('sección nueva: status added y sin renamedFrom', () => {
  const proposal = `${published}${d('c', 'Tres')}<p>gamma</p>`
  const result = diffProposalSections(published, proposal)
  assert.deepEqual(result.counts, { added: 1, changed: 0, removed: 0, unchanged: 2 })
  assert.equal(result.sections[2].status, 'added')
  assert.equal(result.sections[2].sectionName, 'Tres')
  assert.equal(result.sections[2].renamedFrom, null)
})

test('sección eliminada: sale en removedSections, no en sections', () => {
  const proposal = `${d('a', 'Uno')}<p>alfa</p>`
  const result = diffProposalSections(published, proposal)
  assert.deepEqual(result.counts, { added: 0, changed: 0, removed: 1, unchanged: 1 })
  assert.equal(result.sections.length, 1)
  assert.equal(result.removedSections.length, 1)
  assert.equal(result.removedSections[0].sectionId, 'b')
  assert.equal(result.removedSections[0].innerHtml, '<p>beta</p>')
  assert.equal(result.removedSections[0].status, 'removed')
})

test('reordenar secciones sin editarlas no cuenta como cambio; el orden es el de la propuesta', () => {
  const proposal = `${d('b', 'Dos')}<p>beta</p>${d('a', 'Uno')}<p>alfa</p>`
  const result = diffProposalSections(published, proposal)
  assert.equal(result.hasChanges, false)
  assert.deepEqual(result.sections.map((s) => s.sectionId), ['b', 'a'])
})

// -------- 5. Bordes --------

test('documento sin dividers se compara como pseudo-sección __document__', () => {
  const result = diffProposalSections('<p>viejo</p>', '<p>nuevo</p>')
  assert.equal(result.sections.length, 1)
  assert.equal(result.sections[0].sectionId, '__document__')
  assert.equal(result.sections[0].status, 'changed')
})

test('página publicada vacía: todas las secciones de la propuesta son nuevas', () => {
  const result = diffProposalSections('', published)
  assert.deepEqual(result.counts, { added: 2, changed: 0, removed: 0, unchanged: 0 })
})

test('sectionId duplicado: primer-wins, no rompe el diff', () => {
  const proposal = `${d('a', 'Uno')}<p>alfa</p>${d('a', 'Uno clon')}<p>alfa clon</p>${d('b', 'Dos')}<p>beta</p>`
  const result = diffProposalSections(published, proposal)
  assert.equal(result.sections.length, 3)
  assert.equal(result.sections[0].status, 'unchanged')
  // El clon compara contra la MISMA sección publicada 'a' (primer-wins).
  assert.equal(result.sections[1].status, 'changed')
  assert.equal(result.counts.removed, 0)
})

test('entradas nulas no explotan', () => {
  const result = diffProposalSections(null, null)
  assert.equal(result.hasChanges, false)
  assert.deepEqual(result.sections, [])
  assert.deepEqual(result.removedSections, [])
})

// -------- 6. Resumen --------

test('summarizeProposalDiff: singular/plural y omisión de ceros', () => {
  assert.equal(summarizeProposalDiff({ added: 1, changed: 0, removed: 0 }), '1 nueva')
  assert.equal(summarizeProposalDiff({ added: 2, changed: 1, removed: 3 }), '2 nuevas · 1 modificada · 3 eliminadas')
  assert.equal(summarizeProposalDiff({ added: 0, changed: 0, removed: 0 }), '')
  assert.equal(summarizeProposalDiff(null), '')
})
