// backend/src/lib/folderTree.js
// Helpers de carpeta compartidos entre routes/library.js (asset_folders) y
// routes/projectFolders.js (project_folders). Ambas tablas tienen la misma
// forma de árbol (id, parent_folder_id, company_id) y las mismas reglas de
// nombre/permiso, aunque su semántica de borrado difiera (biblioteca usa
// papelera con cascade; carpetas de proyecto reparentan — ver
// planFolderDeletion más abajo, usado solo por projectFolders.js).
//
// Extraído verbatim de routes/library.js (donde vivían wouldCreateFolderCycle
// y validateFolderName) más una generalización de resolveLibraryRole
// (renombrada resolveCompanyRole: no tiene nada específico de biblioteca,
// solo resuelve el rol de escritura/lectura de un usuario en una empresa).
// library.js sigue exportando `resolveLibraryRole` como alias local para no
// romper su API pública ni los tests existentes (ver library-folders.test.js).

export function validateFolderName(raw) {
  const name = String(raw ?? '').trim().slice(0, 80)
  return name || null
}

export function wouldCreateFolderCycle(folders, folderId, nextParentId) {
  if (!nextParentId) return false
  if (nextParentId === folderId) return true
  const byId = new Map(folders.map((f) => [f.id, f]))
  let cursor = byId.get(nextParentId)
  const seen = new Set()
  while (cursor) {
    if (cursor.id === folderId) return true
    if (seen.has(cursor.id)) return false
    seen.add(cursor.id)
    cursor = cursor.parent_folder_id ? byId.get(cursor.parent_folder_id) : null
  }
  return false
}

// NOTA: req.currentUser lo arma loadCurrentUser() en middleware/auth.js con
// forma camelCase (platformRole, memberships: [{ companyId, companyName, role }]),
// igual que lib/projectAccess.js (canWriteProjectContent, getCompanyRole, etc).
export function resolveCompanyRole(currentUser, companyId) {
  if (!currentUser) return null
  if (currentUser.platformRole === 'admin') return 'write'
  if (currentUser.platformRole === 'qa') return 'read'
  const membership = (currentUser.memberships || []).find((m) => m.companyId === companyId)
  if (!membership) return null
  return ['manager', 'editor'].includes(membership.role) ? 'write' : 'read'
}

// planFolderDeletion(folders, projects, folderId) — semántica de borrado de
// carpetas de proyecto (Ola 2, decisión de producto): borrar una carpeta
// JAMÁS toca los proyectos. Sus CONTENIDOS DIRECTOS (subcarpetas y
// proyectos cuyo folder_id/parent_folder_id apunta exactamente a esta
// carpeta) se reparentan a la carpeta PADRE de la borrada, o a la raíz
// (null) si no tenía padre. Los descendientes más profundos (nietos) NO se
// tocan: su parent_folder_id sigue apuntando a su padre directo, que no es
// el que se está borrando, así que no requieren ningún cambio.
//
// Función pura y total: si folderId no aparece en `folders` (no debería
// pasar — el router hace 404 antes de llegar acá) devuelve newParentId null
// y listas vacías en vez de lanzar, mismo criterio defensivo que
// wouldCreateFolderCycle.
export function planFolderDeletion(folders, projects, folderId) {
  const target = (folders || []).find((f) => f.id === folderId)
  const newParentId = target ? (target.parent_folder_id || null) : null

  const reparentedFolderIds = (folders || [])
    .filter((f) => f.id !== folderId && (f.parent_folder_id || null) === folderId)
    .map((f) => f.id)

  const reparentedProjectIds = (projects || [])
    .filter((p) => (p.folder_id || null) === folderId)
    .map((p) => p.id)

  return { newParentId, reparentedFolderIds, reparentedProjectIds }
}
