import assert from 'node:assert/strict'
import { test } from 'node:test'

import { wouldCreateFolderCycle, validateFolderName, resolveLibraryRole, buildLibraryListing } from '../src/routes/library.js'

test('wouldCreateFolderCycle: detecta mover a descendiente y a sí misma', () => {
  const folders = [
    { id: 'a', parent_folder_id: null },
    { id: 'b', parent_folder_id: 'a' },
    { id: 'c', parent_folder_id: 'b' },
  ]
  assert.equal(wouldCreateFolderCycle(folders, 'a', 'c'), true)
  assert.equal(wouldCreateFolderCycle(folders, 'a', 'a'), true)
  assert.equal(wouldCreateFolderCycle(folders, 'c', 'a'), false)
  assert.equal(wouldCreateFolderCycle(folders, 'b', null), false)
})

test('validateFolderName: recorta, limita a 80, rechaza vacío', () => {
  assert.equal(validateFolderName('  Fotos  '), 'Fotos')
  assert.equal(validateFolderName(''), null)
  assert.equal(validateFolderName('x'.repeat(200))?.length, 80)
})

test('resolveLibraryRole: admin write, manager/editor write en su empresa, qa read, resto null', () => {
  // NOTA: req.currentUser real usa camelCase (platformRole, memberships[].companyId) —
  // ver backend/src/middleware/auth.js loadCurrentUser(). Fixtures reflejan esa forma.
  const admin = { platformRole: 'admin', memberships: [] }
  const qa = { platformRole: 'qa', memberships: [] }
  const manager = { platformRole: 'user', memberships: [{ companyId: 'c1', role: 'manager' }] }
  const companyAdmin = { platformRole: 'user', memberships: [{ companyId: 'c1', role: 'admin' }] }
  const outsider = { platformRole: 'user', memberships: [{ companyId: 'c2', role: 'editor' }] }
  assert.equal(resolveLibraryRole(admin, 'c1'), 'write')
  assert.equal(resolveLibraryRole(qa, 'c1'), 'read')
  assert.equal(resolveLibraryRole(manager, 'c1'), 'write')
  // 'admin' de EMPRESA (membresía, no platform) es tier máximo — bug F1-T5 corregido
  assert.equal(resolveLibraryRole(companyAdmin, 'c1'), 'write')
  assert.equal(resolveLibraryRole(outsider, 'c1'), null)
})

test('buildLibraryListing: separa subcarpetas del folder actual y filtra papelera', () => {
  const folders = [
    { id: 'a', parent_folder_id: null, trashed_at: null },
    { id: 'b', parent_folder_id: 'a', trashed_at: null },
    { id: 'z', parent_folder_id: null, trashed_at: '2026-07-01' },
  ]
  const out = buildLibraryListing({ folders, currentFolderId: null })
  assert.deepEqual(out.subfolders.map((f) => f.id), ['a'])
  assert.deepEqual(out.breadcrumb, [])
  const inA = buildLibraryListing({ folders, currentFolderId: 'a' })
  assert.deepEqual(inA.subfolders.map((f) => f.id), ['b'])
  assert.deepEqual(inA.breadcrumb.map((f) => f.id), ['a'])
})

test('buildLibraryListing: expone allFolders (activas, toda la empresa) para el árbol de MoveToFolderModal', () => {
  const folders = [
    { id: 'a', parent_folder_id: null, trashed_at: null },
    { id: 'b', parent_folder_id: 'a', trashed_at: null },
    { id: 'z', parent_folder_id: null, trashed_at: '2026-07-01' },
  ]
  const out = buildLibraryListing({ folders, currentFolderId: 'a' })
  assert.deepEqual(out.allFolders.map((f) => f.id), ['a', 'b'])
})
