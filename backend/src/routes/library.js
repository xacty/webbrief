// backend/src/routes/library.js
// Biblioteca de imágenes por empresa. Montado en /api/companies/:companyId/library
import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { fetchCompanyUsage } from '../lib/storageQuota.js'

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

export function buildLibraryListing({ folders, currentFolderId }) {
  const active = (folders || []).filter((f) => !f.trashed_at)
  const byId = new Map(active.map((f) => [f.id, f]))
  const subfolders = active.filter((f) => (f.parent_folder_id || null) === (currentFolderId || null))
  const breadcrumb = []
  let cursor = currentFolderId ? byId.get(currentFolderId) : null
  while (cursor) {
    breadcrumb.unshift(cursor)
    cursor = cursor.parent_folder_id ? byId.get(cursor.parent_folder_id) : null
  }
  return { subfolders, breadcrumb }
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

router.get('/', readAccess, async (req, res) => {
  const folderId = req.query.folderId || null
  const projectId = req.query.projectId || null
  const view = req.query.view === 'trash' ? 'trash' : 'active'
  const [foldersRes, assetsQuery] = await Promise.all([
    supabaseAdmin.from('asset_folders')
      .select('id, parent_folder_id, name, position, trashed_at, created_at')
      .eq('company_id', req.libraryAccess.companyId)
      .order('position').order('name'),
    (() => {
      let q = supabaseAdmin.from('project_assets')
        .select('id, file_name, storage_bucket, storage_path, mime_type, asset_kind, public_url, file_size, width, height, folder_id, project_id, origin, trashed_at, created_at')
        .eq('company_id', req.libraryAccess.companyId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (view === 'trash') q = q.not('trashed_at', 'is', null)
      else {
        q = q.is('trashed_at', null)
        if (projectId) q = q.eq('project_id', projectId)
        else q = folderId ? q.eq('folder_id', folderId) : q.is('folder_id', null)
      }
      return q
    })(),
  ])
  if (foldersRes.error) return res.status(500).json({ error: foldersRes.error.message })
  if (assetsQuery.error) return res.status(500).json({ error: assetsQuery.error.message })
  const listing = buildLibraryListing({ folders: foldersRes.data || [], currentFolderId: folderId })
  const usage = await fetchCompanyUsage(req.libraryAccess.companyId)
  const { data: company } = await supabaseAdmin.from('companies').select('storage_quota_mb').eq('id', req.libraryAccess.companyId).single()
  res.json({
    ...listing,
    assets: assetsQuery.data || [],
    usage: { ...usage, quotaMb: company?.storage_quota_mb ?? 100 },
    role: req.libraryAccess.role,
  })
})

router.get('/usage', readAccess, async (req, res) => {
  const usage = await fetchCompanyUsage(req.libraryAccess.companyId)
  const { data: company } = await supabaseAdmin.from('companies').select('storage_quota_mb').eq('id', req.libraryAccess.companyId).single()
  res.json({ ...usage, quotaMb: company?.storage_quota_mb ?? 100 })
})

router.get('/search', readAccess, async (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 2) return res.json({ assets: [] })
  const { data, error } = await supabaseAdmin
    .from('project_assets')
    .select('id, file_name, public_url, storage_path, storage_bucket, mime_type, width, height, folder_id')
    .eq('company_id', req.libraryAccess.companyId)
    .is('trashed_at', null)
    .ilike('file_name', `%${q.replace(/[%_]/g, '\\$&')}%`)
    .limit(60)
  if (error) return res.status(500).json({ error: error.message })
  res.json({ assets: data || [] })
})

export default router
