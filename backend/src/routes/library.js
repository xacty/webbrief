// backend/src/routes/library.js
// Biblioteca de imágenes por empresa. Montado en /api/companies/:companyId/library
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { logSecurityEvent } from '../lib/securityAudit.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

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
// El plan original de este task asumía snake_case (platform_role/company_id);
// se ajusta aquí a la forma real para que requireLibraryAccess funcione.
export function resolveLibraryRole(currentUser, companyId) {
  if (!currentUser) return null
  if (currentUser.platformRole === 'admin') return 'write'
  if (currentUser.platformRole === 'qa') return 'read'
  const membership = (currentUser.memberships || []).find((m) => m.companyId === companyId)
  if (!membership) return null
  return ['manager', 'editor'].includes(membership.role) ? 'write' : 'read'
}

// Middleware: resuelve companyId + rol; adjunta req.libraryAccess
async function requireLibraryAccess(req, res, next, { write = false } = {}) {
  const companyId = req.params.companyId
  const role = resolveLibraryRole(req.currentUser, companyId)
  if (!role) return res.status(404).json({ error: 'Empresa no encontrada' })
  if (write && role !== 'write') return res.status(403).json({ error: 'Tu rol no puede modificar la biblioteca' })
  req.libraryAccess = { companyId, role }
  next()
}
const readAccess = (req, res, next) => requireLibraryAccess(req, res, next, { write: false })
const writeAccess = (req, res, next) => requireLibraryAccess(req, res, next, { write: true })

router.post('/folders', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  const name = validateFolderName(req.body?.name)
  if (!name) return res.status(400).json({ error: 'Nombre de carpeta requerido' })
  const parentFolderId = req.body?.parentFolderId || null
  if (parentFolderId) {
    const { data: parent } = await supabaseAdmin
      .from('asset_folders').select('id').eq('id', parentFolderId)
      .eq('company_id', req.libraryAccess.companyId).is('trashed_at', null).maybeSingle()
    if (!parent) return res.status(400).json({ error: 'Carpeta padre no encontrada' })
  }
  const { data, error } = await supabaseAdmin
    .from('asset_folders')
    .insert({
      company_id: req.libraryAccess.companyId,
      parent_folder_id: parentFolderId,
      name,
      created_by: req.currentUser.id,
    })
    .select('*')
    .single()
  if (error) return res.status(500).json({ error: error.message })
  res.status(201).json({ folder: data })
})

router.patch('/folders/:folderId', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  const updates = {}
  if (req.body?.name !== undefined) {
    const name = validateFolderName(req.body.name)
    if (!name) return res.status(400).json({ error: 'Nombre inválido' })
    updates.name = name
  }
  if (req.body?.parentFolderId !== undefined) {
    const nextParent = req.body.parentFolderId || null
    const { data: folders } = await supabaseAdmin
      .from('asset_folders').select('id, parent_folder_id')
      .eq('company_id', req.libraryAccess.companyId)
    if (wouldCreateFolderCycle(folders || [], req.params.folderId, nextParent)) {
      return res.status(400).json({ error: 'No puedes mover una carpeta dentro de sí misma' })
    }
    updates.parent_folder_id = nextParent
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: 'Nada que actualizar' })
  const { data, error } = await supabaseAdmin
    .from('asset_folders').update(updates)
    .eq('id', req.params.folderId).eq('company_id', req.libraryAccess.companyId)
    .select('*').single()
  if (error) return res.status(500).json({ error: error.message })
  res.json({ folder: data })
})

export default router
