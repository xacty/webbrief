import assert from 'node:assert/strict'
import { test } from 'node:test'

import { wouldCreateFolderCycle, validateFolderName, resolveLibraryRole } from '../src/routes/library.js'

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
  const outsider = { platformRole: 'user', memberships: [{ companyId: 'c2', role: 'editor' }] }
  assert.equal(resolveLibraryRole(admin, 'c1'), 'write')
  assert.equal(resolveLibraryRole(qa, 'c1'), 'read')
  assert.equal(resolveLibraryRole(manager, 'c1'), 'write')
  assert.equal(resolveLibraryRole(outsider, 'c1'), null)
})
