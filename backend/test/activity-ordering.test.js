import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSectionOrderIndex, orderSectionActivityGroups } from '../../frontend/src/lib/activityOrdering.js'

// Helper local: serializa un divider de sección igual que ProjectEditor.jsx/sectionMerge.js.
const d = (id, name) => `<div data-section-divider data-section-id="${id}" data-section-name="${name}"></div>`

// Helper: fabrica un activity item mínimo tal como lo devuelve el backend
// (serializeActivity) para eventos section_edited/asset_uploaded.
function item(id, sectionId, createdAt, extra = {}) {
  return {
    id,
    eventType: 'section_edited',
    createdAt,
    metadata: { sectionId, pageId: 'page-1', ...extra },
  }
}

// -------- buildSectionOrderIndex --------

test('buildSectionOrderIndex: __seo__/__document__ primero, luego secciones del doc en su orden real', () => {
  const docSections = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const order = buildSectionOrderIndex(docSections, '')
  assert.equal(order.get('__seo__'), 0)
  assert.equal(order.get('__document__'), 1)
  assert.equal(order.get('a'), 2)
  assert.equal(order.get('b'), 3)
  assert.equal(order.get('c'), 4)
})

test('buildSectionOrderIndex: secciones solo-en-propuesta se agregan DESPUÉS del doc, en orden de la propuesta', () => {
  const docSections = [{ id: 'a' }, { id: 'b' }]
  // La propuesta trae 'a' (ya existe, se ignora) y dos secciones nuevas: 'x' y 'y'.
  const proposalHtml = d('a', 'Uno') + '<p>alfa</p>' + d('x', 'Nueva X') + '<p>x</p>' + d('y', 'Nueva Y') + '<p>y</p>'
  const order = buildSectionOrderIndex(docSections, proposalHtml)
  assert.equal(order.get('a'), 2) // posición del doc, no la de la propuesta
  assert.equal(order.get('b'), 3)
  assert.equal(order.get('x'), 4)
  assert.equal(order.get('y'), 5)
})

test('buildSectionOrderIndex: sectionId ausente del doc y de la propuesta no entra al mapa', () => {
  const order = buildSectionOrderIndex([{ id: 'a' }], d('a', 'Uno') + '<p>alfa</p>')
  assert.equal(order.has('unknown-section'), false)
})

// -------- orderSectionActivityGroups --------

test('orderSectionActivityGroups: agrupa por sectionId y ordena grupos por la posición real de la sección', () => {
  const order = buildSectionOrderIndex([{ id: 'a' }, { id: 'b' }, { id: 'c' }], '')
  // Actividad llega en orden arbitrario (p.ej. created_at DESC del backend) — la sección
  // 'c' es la más reciente pero debe quedar ÚLTIMA porque está última en el documento.
  const items = [
    item('ev-c', 'c', '2026-08-13T12:00:00Z'),
    item('ev-a', 'a', '2026-08-13T10:00:00Z'),
    item('ev-b', 'b', '2026-08-13T11:00:00Z'),
  ]
  const groups = orderSectionActivityGroups(items, order)
  assert.deepEqual(groups.map((g) => g.sectionId), ['a', 'b', 'c'])
})

test('orderSectionActivityGroups: secciones solo-en-propuesta se agrupan igual que las demás, después de las del doc', () => {
  const docSections = [{ id: 'a' }, { id: 'b' }]
  const proposalHtml = d('a', 'Uno') + '<p>alfa</p>' + d('proposal-x', 'Sección nueva') + '<p>x</p>'
  const order = buildSectionOrderIndex(docSections, proposalHtml)
  const items = [
    // El evento del diseñador es el MÁS RECIENTE, pero su sección no existe en el doc
    // montado — antes esto caía a "Actividad general" ordenado por fecha (bug reportado).
    item('ev-x', 'proposal-x', '2026-08-13T15:00:00Z', { eventType: 'asset_uploaded' }),
    item('ev-a', 'a', '2026-08-13T09:00:00Z'),
    item('ev-b', 'b', '2026-08-13T10:00:00Z'),
  ]
  const groups = orderSectionActivityGroups(items, order)
  // 'a' y 'b' (doc) primero en orden real, 'proposal-x' (propuesta) al final — a
  // pesar de ser la actividad más reciente de las tres.
  assert.deepEqual(groups.map((g) => g.sectionId), ['a', 'b', 'proposal-x'])
})

test('orderSectionActivityGroups: sectionIds desconocidos (ni doc ni propuesta) van al final, ordenados por el evento MÁS VIEJO — nunca por el más nuevo', () => {
  const order = buildSectionOrderIndex([{ id: 'a' }], '')
  const items = [
    // 'legacy-2' tiene el evento más reciente de los tres, pero su primer evento
    // (oldest) es más nuevo que el de 'legacy-1' → debe quedar después de legacy-1.
    item('ev-legacy-2-old', 'legacy-2', '2026-08-13T08:00:00Z'),
    item('ev-legacy-2-new', 'legacy-2', '2026-08-13T20:00:00Z'),
    item('ev-legacy-1', 'legacy-1', '2026-08-13T07:00:00Z'),
    item('ev-a', 'a', '2026-08-13T12:00:00Z'),
  ]
  const groups = orderSectionActivityGroups(items, order)
  assert.deepEqual(groups.map((g) => g.sectionId), ['a', 'legacy-1', 'legacy-2'])
})

test('orderSectionActivityGroups: marcar una actividad como leída (readAt en metadata) no altera el orden de los grupos', () => {
  const order = buildSectionOrderIndex([{ id: 'a' }, { id: 'b' }, { id: 'c' }], '')
  const items = [
    item('ev-c', 'c', '2026-08-13T12:00:00Z'),
    item('ev-a', 'a', '2026-08-13T10:00:00Z'),
    item('ev-b', 'b', '2026-08-13T11:00:00Z'),
  ]
  const before = orderSectionActivityGroups(items, order).map((g) => g.sectionId)

  // Simula exactamente lo que hace markActivityRead en ProjectEditor.jsx: reemplaza
  // el item por id con una copia que solo agrega metadata.readAt — createdAt y
  // sectionId quedan intactos, igual que en el response real del PATCH .../read.
  const readItems = items.map((it) => (
    it.id === 'ev-b' ? { ...it, metadata: { ...it.metadata, readAt: '2026-08-13T13:00:00Z', readBy: 'user-1' } } : it
  ))
  const after = orderSectionActivityGroups(readItems, order).map((g) => g.sectionId)

  assert.deepEqual(after, before)
  assert.deepEqual(after, ['a', 'b', 'c'])
})

test('orderSectionActivityGroups: dentro de un grupo, items[0] sigue siendo el evento más reciente (resumen de la fila)', () => {
  const order = buildSectionOrderIndex([{ id: 'a' }], '')
  const items = [
    item('ev-old', 'a', '2026-08-13T09:00:00Z'),
    item('ev-new', 'a', '2026-08-13T11:00:00Z'),
    item('ev-mid', 'a', '2026-08-13T10:00:00Z'),
  ]
  const groups = orderSectionActivityGroups(items, order)
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].items.map((it) => it.id), ['ev-new', 'ev-mid', 'ev-old'])
})

test('orderSectionActivityGroups: items sin sectionId se ignoran (no arman un grupo huérfano)', () => {
  const order = buildSectionOrderIndex([{ id: 'a' }], '')
  const items = [item('ev-a', 'a', '2026-08-13T09:00:00Z'), item('ev-none', null, '2026-08-13T09:00:00Z')]
  const groups = orderSectionActivityGroups(items, order)
  assert.deepEqual(groups.map((g) => g.sectionId), ['a'])
})
