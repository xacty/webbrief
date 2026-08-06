import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveLibrarySection, collectAssetProjectIds } from '../src/routes/library.js'
import { summarizeUsage } from '../src/lib/storageQuota.js'

test('resolveLibrarySection: solo acepta documents y briefs', () => {
  assert.equal(resolveLibrarySection('documents'), 'documents')
  assert.equal(resolveLibrarySection('briefs'), 'briefs')
  assert.equal(resolveLibrarySection('library'), null)
  assert.equal(resolveLibrarySection(''), null)
  assert.equal(resolveLibrarySection(undefined), null)
  assert.equal(resolveLibrarySection(['documents']), null)
})

test('collectAssetProjectIds: únicos, en orden, sin nulos', () => {
  const assets = [
    { id: '1', project_id: 'p1' },
    { id: '2', project_id: null },
    { id: '3', project_id: 'p2' },
    { id: '4', project_id: 'p1' },
    { id: '5' },
  ]
  assert.deepEqual(collectAssetProjectIds(assets), ['p1', 'p2'])
  assert.deepEqual(collectAssetProjectIds([]), [])
  assert.deepEqual(collectAssetProjectIds(), [])
})

// Las secciones de la galería deben partir el universo EXACTAMENTE como la
// barra de almacenamiento. Este test replica en JS los predicados que la query
// aplica en Postgres y compara los conteos contra summarizeUsage.
test('secciones documents/briefs coinciden con las categorías de summarizeUsage', () => {
  const rows = [
    { id: 'a', file_size: 100, project_id: null, uploaded_by: 'u1', trashed_at: null }, // biblioteca
    { id: 'b', file_size: 200, project_id: 'p1', uploaded_by: 'u1', trashed_at: null }, // documento
    { id: 'c', file_size: 300, project_id: 'p1', uploaded_by: null, trashed_at: null }, // brief
    { id: 'd', file_size: 400, project_id: null, uploaded_by: null, trashed_at: null }, // brief sin proyecto
    { id: 'e', file_size: 500, project_id: 'p2', uploaded_by: 'u1', trashed_at: '2026-08-01' }, // papelera
  ]

  const documents = rows.filter((r) => !r.trashed_at && r.project_id !== null && r.uploaded_by !== null)
  const briefs = rows.filter((r) => !r.trashed_at && r.uploaded_by === null)

  const usage = summarizeUsage(rows)
  assert.equal(documents.length, usage.counts.document)
  assert.equal(briefs.length, usage.counts.brief)
  assert.deepEqual(documents.map((r) => r.id), ['b'])
  assert.deepEqual(briefs.map((r) => r.id), ['c', 'd'])
  // Un asset trasheado nunca entra en un tab de sección.
  assert.equal(documents.some((r) => r.id === 'e'), false)
})
