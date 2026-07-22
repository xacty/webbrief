import assert from 'node:assert/strict'
import { test } from 'node:test'
import { splitSections, mergeSections } from '../../frontend/src/lib/sectionMerge.js'

// Helper local: serializa un divider de sección igual que ProjectEditor.jsx (línea ~891/1132).
const d = (id, name) => `<div data-section-divider data-section-id="${id}" data-section-name="${name}"></div>`
const base = d('a', 'Uno') + '<p>alfa</p>' + d('b', 'Dos') + '<p>beta</p>'

// -------- 1. splitSections --------

test('splitSections: parsea ids, nombres, innerHtml y posición; retorna [] para html vacío', () => {
  const sections = splitSections(base)
  assert.equal(sections.length, 2)
  assert.deepEqual(sections[0], { sectionId: 'a', sectionName: 'Uno', innerHtml: '<p>alfa</p>', position: 0 })
  assert.deepEqual(sections[1], { sectionId: 'b', sectionName: 'Dos', innerHtml: '<p>beta</p>', position: 1 })
  assert.deepEqual(splitSections(''), [])
  assert.deepEqual(splitSections(null), [])
})

// -------- 2. Remoto cambia sección b, local intacto --------

test('remoto cambia sección b y local intacto: merged usa contenido remoto en b con origin remote, 0 conflicts, identicalToRemote true', () => {
  const remote = d('a', 'Uno') + '<p>alfa</p>' + d('b', 'Dos') + '<p>beta modificada</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: remote, localHtml: base })
  const sectionB = result.mergedSections.find((s) => s.sectionId === 'b')
  assert.equal(sectionB.innerHtml, '<p>beta modificada</p>')
  assert.equal(sectionB.origin, 'remote')
  assert.equal(result.conflicts.length, 0)
  assert.equal(result.identicalToRemote, true)
})

// -------- 3. Local cambia a, remoto intacto --------

test('local cambia sección a y remoto intacto: merged conserva local con origin local, identicalToRemote false', () => {
  const local = d('a', 'Uno') + '<p>alfa modificada</p>' + d('b', 'Dos') + '<p>beta</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: base, localHtml: local })
  const sectionA = result.mergedSections.find((s) => s.sectionId === 'a')
  assert.equal(sectionA.innerHtml, '<p>alfa modificada</p>')
  assert.equal(sectionA.origin, 'local')
  assert.equal(result.identicalToRemote, false)
})

// -------- 4. Ambos cambian a con contenido distinto --------

test('ambos cambian sección a con contenido distinto: conflicto edit y merged conserva local', () => {
  const remote = d('a', 'Uno') + '<p>alfa remota</p>' + d('b', 'Dos') + '<p>beta</p>'
  const local = d('a', 'Uno') + '<p>alfa local</p>' + d('b', 'Dos') + '<p>beta</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: remote, localHtml: local })
  assert.equal(result.conflicts.length, 1)
  assert.deepEqual(result.conflicts[0], {
    sectionId: 'a',
    sectionName: 'Uno',
    localHtml: '<p>alfa local</p>',
    remoteHtml: '<p>alfa remota</p>',
    type: 'edit',
  })
  const sectionA = result.mergedSections.find((s) => s.sectionId === 'a')
  assert.equal(sectionA.innerHtml, '<p>alfa local</p>')
  assert.equal(sectionA.origin, 'local')
})

// -------- 5. Ambos cambian a al mismo html --------

test('ambos cambian sección a al mismo html: sin conflicto', () => {
  const changed = d('a', 'Uno') + '<p>alfa igual</p>' + d('b', 'Dos') + '<p>beta</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: changed, localHtml: changed })
  assert.equal(result.conflicts.length, 0)
})

// -------- 6. Remoto agrega sección c al final --------

test('remoto agrega sección c al final: aparece en merged en su posición con origin remote', () => {
  const remote = base + d('c', 'Tres') + '<p>gamma</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: remote, localHtml: base })
  assert.equal(result.mergedSections.length, 3)
  const sectionC = result.mergedSections[2]
  assert.equal(sectionC.sectionId, 'c')
  assert.equal(sectionC.innerHtml, '<p>gamma</p>')
  assert.equal(sectionC.origin, 'remote')
})

// -------- 7. Remoto elimina b, local no la tocó --------

test('remoto elimina b y local no la tocó: merged sin b', () => {
  const remote = d('a', 'Uno') + '<p>alfa</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: remote, localHtml: base })
  assert.equal(result.mergedSections.find((s) => s.sectionId === 'b'), undefined)
})

// -------- 8. Remoto elimina b, local la editó --------

test('remoto elimina b y local la editó: conflicto deleted-remote con remoteHtml null, merged conserva b local', () => {
  const remote = d('a', 'Uno') + '<p>alfa</p>'
  const local = d('a', 'Uno') + '<p>alfa</p>' + d('b', 'Dos') + '<p>beta editada</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: remote, localHtml: local })
  assert.equal(result.conflicts.length, 1)
  assert.deepEqual(result.conflicts[0], {
    sectionId: 'b',
    sectionName: 'Dos',
    localHtml: '<p>beta editada</p>',
    remoteHtml: null,
    type: 'deleted-remote',
  })
  const sectionB = result.mergedSections.find((s) => s.sectionId === 'b')
  assert.equal(sectionB.innerHtml, '<p>beta editada</p>')
  assert.equal(sectionB.origin, 'local')
})

// -------- 9. Remoto renombra el divider de una sección --------

test('remoto renombra divider de sección y local no: merged usa el nombre remoto', () => {
  const remote = d('a', 'Uno renombrada') + '<p>alfa</p>' + d('b', 'Dos') + '<p>beta</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: remote, localHtml: base })
  const sectionA = result.mergedSections.find((s) => s.sectionId === 'a')
  assert.equal(sectionA.sectionName, 'Uno renombrada')
})

// -------- 10. Whitespace --------

test('remoto solo difiere de base en whitespace entre tags: sin cambios si local intacto', () => {
  const remote = d('a', 'Uno') + '<p>alfa</p>\n  ' + d('b', 'Dos') + '  <p>beta</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: remote, localHtml: base })
  assert.equal(result.conflicts.length, 0)
  assert.equal(result.identicalToRemote, true)
})

// -------- 11. HTML sin dividers (documento único) --------

test('html sin dividers se trata como sección única __document__: remoto cambia y local intacto toma remoto', () => {
  const docBase = '<p>documento base</p>'
  const docRemote = '<p>documento remoto</p>'
  const result = mergeSections({ baseHtml: docBase, remoteHtml: docRemote, localHtml: docBase })
  assert.equal(result.mergedSections.length, 1)
  assert.equal(result.mergedSections[0].sectionId, '__document__')
  assert.equal(result.mergedSections[0].innerHtml, docRemote)
  assert.equal(result.mergedSections[0].origin, 'remote')
})

test('html sin dividers: ambos cambian distinto produce conflicto edit', () => {
  const docBase = '<p>documento base</p>'
  const docRemote = '<p>documento remoto</p>'
  const docLocal = '<p>documento local</p>'
  const result = mergeSections({ baseHtml: docBase, remoteHtml: docRemote, localHtml: docLocal })
  assert.equal(result.conflicts.length, 1)
  assert.equal(result.conflicts[0].sectionId, '__document__')
  assert.equal(result.conflicts[0].type, 'edit')
  assert.equal(result.mergedSections[0].innerHtml, docLocal)
})

// -------- 12. Local reordenó secciones + remoto agregó sección c nueva --------

test('local reordena secciones y remoto agrega sección c nueva: orden local se respeta y c se agrega al final con nota structural', () => {
  const localReordered = d('b', 'Dos') + '<p>beta</p>' + d('a', 'Uno') + '<p>alfa</p>'
  const remote = base + d('c', 'Tres') + '<p>gamma</p>'
  const result = mergeSections({ baseHtml: base, remoteHtml: remote, localHtml: localReordered })
  const ids = result.mergedSections.map((s) => s.sectionId)
  assert.deepEqual(ids, ['b', 'a', 'c'])
  const sectionC = result.mergedSections.find((s) => s.sectionId === 'c')
  assert.equal(sectionC.origin, 'remote')
  assert.ok(result.structuralNotes.some((n) => n.type === 'remote-add-appended' && n.sectionId === 'c'))
})
