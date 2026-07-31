import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildSectionEditHistoryEntry, buildSeoChangeHistoryEntry } from '../src/lib/projectAccess.js'

// Estos helpers puros construyen la entrada individual que se agrega a
// metadata.history[] en cada guardado (recordSectionEditActivities /
// recordSeoChangedActivities tocan Supabase directamente y no son testeables
// en aislamiento, por eso la construcción de la entrada vive aparte).

const baseEvent = {
  changeTypes: ['text_changed'],
  sectionHtml: '<p>Contenido nuevo</p>',
}
const currentUser = { id: 'user-1', fullName: 'Ana Editor' }
const actor = 'Ana Editor'
const timestamp = '2026-07-31T12:00:00.000Z'

// -------- buildSectionEditHistoryEntry --------

test('buildSectionEditHistoryEntry: el source recibido llega a la entrada del historial', () => {
  const entry = buildSectionEditHistoryEntry({ event: baseEvent, currentUser, actor, timestamp, source: 'manual' })
  assert.equal(entry.source, 'manual')
})

test('buildSectionEditHistoryEntry: sin source, el default es autosave', () => {
  const entry = buildSectionEditHistoryEntry({ event: baseEvent, currentUser, actor, timestamp })
  assert.equal(entry.source, 'autosave')
})

test('buildSectionEditHistoryEntry: source "mcp" se preserva (edición del agente vía MCP)', () => {
  const entry = buildSectionEditHistoryEntry({ event: baseEvent, currentUser, actor, timestamp, source: 'mcp' })
  assert.equal(entry.source, 'mcp')
})

test('buildSectionEditHistoryEntry: conserva el resto de los campos de la entrada (actor no cambia por source)', () => {
  const entry = buildSectionEditHistoryEntry({ event: baseEvent, currentUser, actor, timestamp, source: 'mcp' })
  assert.deepEqual(entry, {
    changeTypes: ['text_changed'],
    actorId: 'user-1',
    actorLabel: 'Ana Editor',
    at: timestamp,
    htmlAfter: '<p>Contenido nuevo</p>',
    source: 'mcp',
  })
})

test('buildSectionEditHistoryEntry: actorId es null cuando no hay currentUser (ej. acceso por share link)', () => {
  const entry = buildSectionEditHistoryEntry({ event: baseEvent, currentUser: null, actor: 'Cliente', timestamp, source: 'manual' })
  assert.equal(entry.actorId, null)
  assert.equal(entry.actorLabel, 'Cliente')
})

test('buildSectionEditHistoryEntry: htmlAfter cae a cadena vacía cuando el evento no trae sectionHtml (ej. section_removed)', () => {
  const entry = buildSectionEditHistoryEntry({
    event: { changeTypes: ['section_removed'] },
    currentUser,
    actor,
    timestamp,
    source: 'autosave',
  })
  assert.equal(entry.htmlAfter, '')
})

// -------- buildSeoChangeHistoryEntry --------

const seoEvent = {
  changeTypes: ['seo_title_changed'],
  previousValues: { titleTag: 'Antes' },
  nextValues: { titleTag: 'Después' },
}

test('buildSeoChangeHistoryEntry: el source recibido llega a la entrada del historial', () => {
  const entry = buildSeoChangeHistoryEntry({ event: seoEvent, currentUser, actor, timestamp, source: 'manual' })
  assert.equal(entry.source, 'manual')
})

test('buildSeoChangeHistoryEntry: sin source, el default es autosave', () => {
  const entry = buildSeoChangeHistoryEntry({ event: seoEvent, currentUser, actor, timestamp })
  assert.equal(entry.source, 'autosave')
})

test('buildSeoChangeHistoryEntry: source "mcp" se preserva (edición del agente vía MCP)', () => {
  const entry = buildSeoChangeHistoryEntry({ event: seoEvent, currentUser, actor, timestamp, source: 'mcp' })
  assert.equal(entry.source, 'mcp')
})

test('buildSeoChangeHistoryEntry: conserva el resto de los campos de la entrada (previousValues/nextValues)', () => {
  const entry = buildSeoChangeHistoryEntry({ event: seoEvent, currentUser, actor, timestamp, source: 'mcp' })
  assert.deepEqual(entry, {
    changeTypes: ['seo_title_changed'],
    actorId: 'user-1',
    actorLabel: 'Ana Editor',
    at: timestamp,
    previousValues: { titleTag: 'Antes' },
    nextValues: { titleTag: 'Después' },
    source: 'mcp',
  })
})
