import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  wouldCreateFolderCycle,
  validateFolderName,
  resolveCompanyRole,
  planFolderDeletion,
} from '../src/lib/folderTree.js'

// wouldCreateFolderCycle / validateFolderName / resolveCompanyRole ya se
// prueban vía library.js en library-folders.test.js (siguen siendo la misma
// función, solo re-exportada). Se repiten aquí importando directo de
// folderTree.js para dejar constancia de que el módulo compartido funciona
// standalone, sin depender de que library.js lo re-exporte.

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
  assert.equal(validateFolderName('  Sitios web  '), 'Sitios web')
  assert.equal(validateFolderName(''), null)
  assert.equal(validateFolderName('x'.repeat(200))?.length, 80)
})

test('resolveCompanyRole: admin write, manager/editor write en su empresa, qa read, resto null', () => {
  const admin = { platformRole: 'admin', memberships: [] }
  const qa = { platformRole: 'qa', memberships: [] }
  const manager = { platformRole: 'user', memberships: [{ companyId: 'c1', role: 'manager' }] }
  const outsider = { platformRole: 'user', memberships: [{ companyId: 'c2', role: 'editor' }] }
  assert.equal(resolveCompanyRole(admin, 'c1'), 'write')
  assert.equal(resolveCompanyRole(qa, 'c1'), 'read')
  assert.equal(resolveCompanyRole(manager, 'c1'), 'write')
  assert.equal(resolveCompanyRole(outsider, 'c1'), null)
})

test('planFolderDeletion: reparenta subcarpetas y proyectos directos al padre de la carpeta borrada', () => {
  const folders = [
    { id: 'root', parent_folder_id: null },
    { id: 'a', parent_folder_id: 'root' },
    { id: 'b', parent_folder_id: 'a' },
    { id: 'c', parent_folder_id: 'a' },
  ]
  const projects = [
    { id: 'p1', folder_id: 'a' },
    { id: 'p2', folder_id: 'a' },
    { id: 'p3', folder_id: 'root' },
  ]
  const plan = planFolderDeletion(folders, projects, 'a')
  assert.equal(plan.newParentId, 'root')
  assert.deepEqual(plan.reparentedFolderIds.sort(), ['b', 'c'])
  assert.deepEqual(plan.reparentedProjectIds.sort(), ['p1', 'p2'])
})

test('planFolderDeletion: reparenta a la raíz (null) cuando la carpeta borrada no tiene padre', () => {
  const folders = [
    { id: 'root', parent_folder_id: null },
    { id: 'child', parent_folder_id: 'root' },
  ]
  const projects = [{ id: 'p1', folder_id: 'root' }]
  const plan = planFolderDeletion(folders, projects, 'root')
  assert.equal(plan.newParentId, null)
  assert.deepEqual(plan.reparentedFolderIds, ['child'])
  assert.deepEqual(plan.reparentedProjectIds, ['p1'])
})

test('planFolderDeletion: no toca nietos ni contenidos de otras carpetas (solo hijos directos)', () => {
  const folders = [
    { id: 'a', parent_folder_id: null },
    { id: 'b', parent_folder_id: 'a' },
    { id: 'c', parent_folder_id: 'b' },
  ]
  const projects = [
    { id: 'p1', folder_id: 'b' },
    { id: 'p2', folder_id: 'c' },
  ]
  const plan = planFolderDeletion(folders, projects, 'a')
  assert.equal(plan.newParentId, null)
  assert.deepEqual(plan.reparentedFolderIds, ['b'])
  assert.deepEqual(plan.reparentedProjectIds, [], 'p1/p2 cuelgan de b/c, no de a: no se tocan')
})

test('planFolderDeletion: carpeta sin subcarpetas ni proyectos devuelve listas vacías', () => {
  const folders = [{ id: 'a', parent_folder_id: null }]
  const plan = planFolderDeletion(folders, [], 'a')
  assert.equal(plan.newParentId, null)
  assert.deepEqual(plan.reparentedFolderIds, [])
  assert.deepEqual(plan.reparentedProjectIds, [])
})

test('planFolderDeletion: folderId inexistente es defensivo (no lanza, newParentId null, listas vacías)', () => {
  const folders = [{ id: 'a', parent_folder_id: null }]
  const projects = [{ id: 'p1', folder_id: 'a' }]
  const plan = planFolderDeletion(folders, projects, 'ghost')
  assert.equal(plan.newParentId, null)
  assert.deepEqual(plan.reparentedFolderIds, [])
  assert.deepEqual(plan.reparentedProjectIds, [], 'p1 pertenece a "a", no a la carpeta inexistente')
})

test('planFolderDeletion: ids null/undefined en folder_id se tratan como raíz, no colisionan con parent_folder_id null', () => {
  const folders = [
    { id: 'a', parent_folder_id: null },
    { id: 'b', parent_folder_id: 'a' },
  ]
  const projects = [{ id: 'p1', folder_id: null }]
  // Borrar 'a' (raíz) no debe arrastrar proyectos que YA estaban en la raíz
  // (folder_id null) — solo los que apuntaban exactamente a 'a'.
  const plan = planFolderDeletion(folders, projects, 'a')
  assert.deepEqual(plan.reparentedProjectIds, [])
  assert.deepEqual(plan.reparentedFolderIds, ['b'])
})
