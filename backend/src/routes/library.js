// backend/src/routes/library.js
// Biblioteca de imágenes por empresa. Montado en /api/companies/:companyId/library
import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { fetchCompanyUsage, checkCompanyStorageQuota } from '../lib/storageQuota.js'
import { decideUploadConversion, uploadWithIngest, adjustFileNameForAction, MAX_UPLOAD_BYTES } from '../lib/imageIngest.js'
import { buildImageKitPath, sanitizeFileName } from '../lib/imagekit.js'

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

const libraryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
})

// NOTA sobre el branch SVG: el plan original (escrito antes de que F0
// mergeara en esta rama) asumía que SVG seguía subiéndose a Supabase Storage
// bucket `project-assets`, replicando un patrón que en su momento existía en
// projects.js. Se verificó el código actual (grep "storage.from(" y
// "getPublicUrl" en src/routes y src/lib): ese patrón ya no existe en
// ninguna parte viva del backend. Desde F0, POST /api/projects/:id/assets
// (projects.js ~1966) sube SVG y raster por el mismo camino —
// uploadWithIngest / ImageKit — porque imageIngest.js ya trata SVG como
// passthrough (igual que GIF). Se replica ese flujo real y vigente: un único
// ingest por ImageKit para todos los mime types soportados, sin bucket de
// Supabase Storage de por medio.
router.post('/assets', rateLimiters.authenticatedUpload, writeAccess, libraryUpload.single('file'), async (req, res) => {
  try {
    const file = req.file
    if (!file) return res.status(400).json({ error: 'Archivo requerido' })
    const plan = decideUploadConversion({ mimeType: file.mimetype, size: file.size })
    if (!plan.ok) {
      const messages = {
        size_exceeded: 'El archivo supera el límite de 30 MB',
        unsupported_mime: 'Formato no soportado (JPG, PNG, WebP, GIF o SVG)',
      }
      return res.status(400).json({ error: messages[plan.reason] || 'Archivo inválido', code: plan.reason })
    }

    const isSvg = file.mimetype === 'image/svg+xml'
    if (isSvg && file.size > 8 * 1024 * 1024) {
      return res.status(400).json({ error: 'Los SVG no pueden superar 8 MB', code: 'size_exceeded' })
    }

    const quota = await checkCompanyStorageQuota(req.libraryAccess.companyId, file.size)
    if (!quota.allowed) return res.status(413).json({ error: quota.message, code: quota.code })

    const folderId = req.body?.folderId || null
    const assetId = crypto.randomUUID()

    const ikFolder = buildImageKitPath('companies', req.libraryAccess.companyId, 'library', folderId || 'root')
    const ingest = await uploadWithIngest({
      buffer: file.buffer,
      fileName: `${assetId}-${sanitizeFileName(file.originalname)}`,
      folder: ikFolder,
      tags: ['library-asset'],
      mimeType: file.mimetype,
      size: file.size,
    })
    if (!ingest.ok) {
      return res.status(400).json({ error: 'Archivo inválido', code: ingest.reason })
    }
    const upload = ingest.upload

    const assetRow = {
      id: assetId,
      company_id: req.libraryAccess.companyId,
      project_id: null,
      folder_id: folderId,
      uploaded_by: req.currentUser.id,
      file_name: adjustFileNameForAction(file.originalname, ingest.action),
      storage_bucket: 'imagekit',
      storage_path: upload.filePath,
      imagekit_file_id: upload.fileId || null,
      mime_type: ingest.mimeType,
      asset_kind: isSvg ? 'svg' : 'image',
      public_url: upload.url || null,
      file_size: upload.size || file.size,
      width: upload.width || null,
      height: upload.height || null,
      // A diferencia del upload directo del editor, un asset de biblioteca
      // nunca se auto-inserta en un documento al subirse: queda en la
      // biblioteca hasta que se elige desde el picker "Desde biblioteca".
      // Mismo criterio que las subidas públicas del brief (public.js).
      render_inline: false,
      origin: 'upload',
      source_metadata: {
        originalFileName: file.originalname,
        originalSize: file.size,
        originalMime: file.mimetype,
      },
    }

    const { data: asset, error } = await supabaseAdmin
      .from('project_assets')
      .insert(assetRow)
      .select('*')
      .single()
    if (error) return res.status(500).json({ error: error.message })

    res.status(201).json({
      asset,
      savings: ingest.converted
        ? { originalBytes: file.size, finalBytes: asset.file_size }
        : null,
    })
  } catch (error) {
    console.error('library ingest error', error)
    res.status(502).json({ error: 'No se pudo procesar la imagen. Intenta de nuevo.' })
  }
})

router.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'El archivo supera el límite de 30 MB', code: 'size_exceeded' })
  }
  next(error)
})

export default router
