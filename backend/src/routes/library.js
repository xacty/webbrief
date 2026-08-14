// backend/src/routes/library.js
// Biblioteca de imágenes por empresa. Montado en /api/companies/:companyId/library
import { Router } from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import archiver from 'archiver'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { fetchCompanyUsage, checkCompanyStorageQuota } from '../lib/storageQuota.js'
import { wouldCreateFolderCycle, validateFolderName, resolveCompanyRole } from '../lib/folderTree.js'
import { decideUploadConversion, uploadWithIngest, adjustFileNameForAction, MAX_UPLOAD_BYTES } from '../lib/imageIngest.js'
import {
  buildImageKitPath,
  sanitizeFileName,
  slugifyFileBaseName,
  deleteFromImageKit,
  buildImageKitUrl,
  buildImageKitTransformations,
} from '../lib/imagekit.js'
import { findReferencedAssetIds } from '../lib/assetReferences.js'
import { resolveCompanyAssetForExport, normalizeExportOptions, buildExportFileName } from '../lib/assetExport.js'

const router = Router({ mergeParams: true })
router.use(requireAuth)

// wouldCreateFolderCycle, validateFolderName y resolveLibraryRole vivían acá
// y se movieron a lib/folderTree.js (Ola 2 / O2.b) para compartirlos con
// routes/projectFolders.js. Se re-exportan bajo el mismo nombre para no
// romper la API pública de este módulo ni los tests existentes
// (library-folders.test.js los importa desde routes/library.js).
// resolveLibraryRole no tenía nada específico de biblioteca — se generalizó
// a resolveCompanyRole; acá queda como alias local (se sigue usando dentro
// de este archivo) y re-exportado con el nombre viejo.
export { wouldCreateFolderCycle, validateFolderName }
export const resolveLibraryRole = resolveCompanyRole

export function validateAssetFileName(raw) {
  const name = String(raw ?? '').trim().slice(0, 255)
  return name || null
}

// Recorre folders (lista completa de la empresa, cualquier estado de papelera)
// y devuelve [folderId, ...todos los descendientes] via BFS sobre
// parent_folder_id. Usado para cascadear trash/restore de carpetas. Si
// folderId no existe en la lista, devuelve [folderId] (sin descendientes).
export function collectFolderSubtreeIds(folders, folderId) {
  const childrenByParent = new Map()
  for (const folder of folders || []) {
    const parentId = folder.parent_folder_id || null
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    childrenByParent.get(parentId).push(folder.id)
  }
  const result = []
  const seen = new Set()
  const queue = [folderId]
  while (queue.length) {
    const current = queue.shift()
    if (seen.has(current)) continue
    seen.add(current)
    result.push(current)
    for (const childId of childrenByParent.get(current) || []) queue.push(childId)
  }
  return result
}

// Separa assets referenciados (usados en content_html de alguna página) de
// los que se pueden enviar a la papelera sin riesgo. `kept` solo trae
// {id, reason} — el fileName para el toast se agrega en el endpoint, que sí
// tiene la fila completa del asset (mantiene esta función pura y testeable
// sin depender de qué columnas se hayan seleccionado).
export function partitionTrashableAssets({ assets, referencedIds }) {
  const trashable = []
  const kept = []
  for (const asset of assets || []) {
    if (referencedIds.has(asset.id)) kept.push({ id: asset.id, reason: 'referenced' })
    else trashable.push(asset)
  }
  return { trashable, kept }
}

// `allFolders` (todas las carpetas activas de la empresa, cualquier
// profundidad) se agrega al retorno de esta función — no sólo Task 6
// (listado por carpeta) la consume. Task 13 (MoveToFolderModal, frontend)
// necesita el árbol COMPLETO para dejar elegir cualquier carpeta destino, y
// `subfolders` sólo trae los hijos directos de `currentFolderId`. La query
// de folders en GET / ya trae todas las filas de la empresa antes de este
// filtro — `active` ya era ese universo completo, sólo faltaba exponerlo.
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
  return { subfolders, breadcrumb, allFolders: active }
}

// Secciones de solo-lectura del listado (tabs "Documentos" y "Briefs" de la
// galería). Las categorías son EXACTAMENTE las de summarizeUsage
// (lib/storageQuota.js) para que los tabs y la barra de almacenamiento nunca
// discrepen: brief = `uploaded_by IS NULL`; documentos = `project_id NOT NULL`
// con `uploaded_by NOT NULL`; biblioteca (default) = `project_id IS NULL`.
// La papelera queda fuera: tiene su propia vista (`view=trash`).
export function resolveLibrarySection(raw) {
  return raw === 'documents' || raw === 'briefs' ? raw : null
}

// Ids de proyecto referenciados por los assets devueltos — el listado no trae
// nombres de proyecto, así que el backend resuelve un mapa mínimo en vez de
// obligar al frontend a un fetch por grupo.
export function collectAssetProjectIds(assets = []) {
  const ids = []
  const seen = new Set()
  for (const asset of assets) {
    const projectId = asset?.project_id
    if (!projectId || seen.has(projectId)) continue
    seen.add(projectId)
    ids.push(projectId)
  }
  return ids
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
  const section = resolveLibrarySection(req.query.section)
  // Con `section` las carpetas no aplican: documentos y briefs se agrupan por
  // proyecto, no por carpeta.
  const folderId = section ? null : (req.query.folderId || null)
  const projectId = req.query.projectId || null
  const view = section ? 'active' : (req.query.view === 'trash' ? 'trash' : 'active')
  const [foldersRes, assetsQuery] = await Promise.all([
    supabaseAdmin.from('asset_folders')
      .select('id, parent_folder_id, name, position, trashed_at, created_at')
      .eq('company_id', req.libraryAccess.companyId)
      .order('position').order('name'),
    (() => {
      let q = supabaseAdmin.from('project_assets')
        .select('id, file_name, storage_bucket, storage_path, mime_type, asset_kind, public_url, file_size, width, height, folder_id, project_id, page_id, section_id, uploaded_by, origin, trashed_at, created_at')
        .eq('company_id', req.libraryAccess.companyId)
        .order('created_at', { ascending: false })
        .limit(500)
      if (section === 'documents') {
        q = q.is('trashed_at', null).not('project_id', 'is', null).not('uploaded_by', 'is', null)
      } else if (section === 'briefs') {
        q = q.is('trashed_at', null).is('uploaded_by', null)
      } else if (view === 'trash') q = q.not('trashed_at', 'is', null)
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
  const assets = assetsQuery.data || []
  const usage = await fetchCompanyUsage(req.libraryAccess.companyId)
  const { data: company } = await supabaseAdmin.from('companies').select('storage_quota_mb').eq('id', req.libraryAccess.companyId).single()

  let projects = []
  const projectIds = section ? collectAssetProjectIds(assets) : []
  if (projectIds.length > 0) {
    const { data: projectRows } = await supabaseAdmin
      .from('projects')
      .select('id, name')
      .eq('company_id', req.libraryAccess.companyId)
      .in('id', projectIds)
    projects = projectRows || []
  }

  res.json({
    ...listing,
    assets,
    projects,
    section: section || null,
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

// ---------------------------------------------------------------------------
// Bulk: mover, papelera, restaurar. Rutas declaradas ANTES de cualquier
// `/:param` de un solo segmento adicional que pudiera shadowearlas (p. ej.
// `PATCH /assets/:assetId` más abajo). `/assets/bulk/*` tiene 3 segmentos
// (assets, bulk, move|trash|restore) así que `:assetId` (2 segmentos) nunca
// las alcanzaría, pero se respeta el orden pedido como defensa explícita.
// ---------------------------------------------------------------------------

router.post('/assets/bulk/move', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : []
    if (ids.length === 0) return res.status(400).json({ error: 'Falta lista de archivos' })
    if (ids.length > 100) return res.status(400).json({ error: 'Máximo 100 archivos por operación' })

    const folderId = req.body?.folderId || null
    if (folderId) {
      const { data: folder } = await supabaseAdmin
        .from('asset_folders')
        .select('id')
        .eq('id', folderId)
        .eq('company_id', req.libraryAccess.companyId)
        .is('trashed_at', null)
        .maybeSingle()
      if (!folder) return res.status(400).json({ error: 'Carpeta destino no encontrada' })
    }

    const { data: updated, error } = await supabaseAdmin
      .from('project_assets')
      .update({ folder_id: folderId })
      .in('id', ids)
      .eq('company_id', req.libraryAccess.companyId)
      .is('trashed_at', null)
      .select('id')
    if (error) return res.status(500).json({ error: error.message })

    const movedIds = new Set((updated || []).map((row) => row.id))
    const failed = ids
      .filter((id) => !movedIds.has(id))
      .map((id) => ({ id, reason: 'No encontrado' }))

    if (movedIds.size > 0) {
      await logSecurityEvent(req, {
        action: 'library_assets_moved',
        resourceType: 'project_asset',
        companyId: req.libraryAccess.companyId,
        metadata: { count: movedIds.size, folderId, bulk: true },
      })
    }

    const status = failed.length === 0 ? 200 : (movedIds.size === 0 ? 400 : 207)
    return res.status(status).json({ moved: movedIds.size, failed })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron mover los archivos' })
  }
})

// POST /assets/bulk/trash { ids, force? } — trashea assets activos de la
// empresa. Si force !== true, protege los assets referenciados en el
// content_html de alguna página (findReferencedAssetIds): esos quedan en
// `kept` con motivo 'referenced' y NO se tocan. force:true salta la
// protección por completo (no calcula referencias).
router.post('/assets/bulk/trash', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : []
    if (ids.length === 0) return res.status(400).json({ error: 'Falta lista de archivos' })
    if (ids.length > 100) return res.status(400).json({ error: 'Máximo 100 archivos por operación' })
    const force = req.body?.force === true

    const { data: assets, error: assetsError } = await supabaseAdmin
      .from('project_assets')
      .select('id, file_name')
      .in('id', ids)
      .eq('company_id', req.libraryAccess.companyId)
      .is('trashed_at', null)
    if (assetsError) return res.status(500).json({ error: assetsError.message })
    if (!assets || assets.length === 0) return res.json({ trashed: 0, trashedIds: [], kept: [] })

    const referencedIds = force ? new Set() : await findReferencedAssetIds(req.libraryAccess.companyId, assets)
    const { trashable, kept } = partitionTrashableAssets({ assets, referencedIds })

    let trashedCount = 0
    let trashedIds = []
    if (trashable.length > 0) {
      const timestamp = new Date()
      const deleteAfter = new Date(timestamp.getTime() + 30 * 24 * 60 * 60 * 1000)
      const { data: trashedRows, error: trashError } = await supabaseAdmin
        .from('project_assets')
        .update({
          trashed_at: timestamp.toISOString(),
          delete_after: deleteAfter.toISOString(),
          deleted_by: req.currentUser.id,
        })
        .in('id', trashable.map((asset) => asset.id))
        .eq('company_id', req.libraryAccess.companyId)
        .select('id')
      if (trashError) return res.status(500).json({ error: trashError.message })
      trashedCount = (trashedRows || []).length
      // Expuesto además del contador para que el frontend pueda ofrecer
      // "Deshacer" sobre exactamente los ids que quedaron trasheados (no
      // sobre `ids` del request, que puede incluir ids `kept` por estar
      // referenciados — ver ActionToast/moveAssetsAndNotify-equivalente en
      // LibraryPage.jsx). Aditivo: no cambia el shape existente, sólo agrega
      // el campo.
      trashedIds = (trashedRows || []).map((row) => row.id)
    }

    const assetById = new Map(assets.map((asset) => [asset.id, asset]))
    const keptWithFileName = kept.map((item) => ({
      ...item,
      fileName: assetById.get(item.id)?.file_name || null,
    }))

    if (trashedCount > 0) {
      await logSecurityEvent(req, {
        action: 'library_assets_trashed',
        resourceType: 'project_asset',
        companyId: req.libraryAccess.companyId,
        metadata: { count: trashedCount, kept: keptWithFileName.length, force, bulk: true },
      })
    }

    return res.json({ trashed: trashedCount, trashedIds, kept: keptWithFileName })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar a la papelera' })
  }
})

// POST /assets/bulk/restore { ids } — limpia trashed_at/delete_after de
// assets trasheados de la empresa. Si folder_id apunta a una carpeta que ya
// no existe o sigue trasheada, el asset se repone en la raíz (folder_id null)
// en vez de quedar oculto dentro de una carpeta invisible.
router.post('/assets/bulk/restore', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : []
    if (ids.length === 0) return res.status(400).json({ error: 'Falta lista de archivos' })
    if (ids.length > 100) return res.status(400).json({ error: 'Máximo 100 archivos por operación' })

    const { data: assets, error: assetsError } = await supabaseAdmin
      .from('project_assets')
      .select('id, folder_id')
      .in('id', ids)
      .eq('company_id', req.libraryAccess.companyId)
      .not('trashed_at', 'is', null)
    if (assetsError) return res.status(500).json({ error: assetsError.message })
    if (!assets || assets.length === 0) {
      return res.status(404).json({ error: 'No se encontraron archivos en la papelera' })
    }

    const { data: folders, error: foldersError } = await supabaseAdmin
      .from('asset_folders')
      .select('id')
      .eq('company_id', req.libraryAccess.companyId)
      .is('trashed_at', null)
    if (foldersError) return res.status(500).json({ error: foldersError.message })
    const validFolderIds = new Set((folders || []).map((folder) => folder.id))

    const keepFolder = assets.filter((asset) => !asset.folder_id || validFolderIds.has(asset.folder_id)).map((asset) => asset.id)
    const clearFolder = assets.filter((asset) => asset.folder_id && !validFolderIds.has(asset.folder_id)).map((asset) => asset.id)

    let restoredCount = 0
    if (keepFolder.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('project_assets')
        .update({ trashed_at: null, delete_after: null })
        .in('id', keepFolder)
        .eq('company_id', req.libraryAccess.companyId)
        .select('id')
      if (error) return res.status(500).json({ error: error.message })
      restoredCount += (data || []).length
    }
    if (clearFolder.length > 0) {
      const { data, error } = await supabaseAdmin
        .from('project_assets')
        .update({ trashed_at: null, delete_after: null, folder_id: null })
        .in('id', clearFolder)
        .eq('company_id', req.libraryAccess.companyId)
        .select('id')
      if (error) return res.status(500).json({ error: error.message })
      restoredCount += (data || []).length
    }

    const restoredIds = new Set(assets.map((asset) => asset.id))
    const failed = ids
      .filter((id) => !restoredIds.has(id))
      .map((id) => ({ id, reason: 'No encontrado en la papelera' }))

    if (restoredCount > 0) {
      await logSecurityEvent(req, {
        action: 'library_assets_restored',
        resourceType: 'project_asset',
        companyId: req.libraryAccess.companyId,
        metadata: { count: restoredCount, bulk: true },
      })
    }

    const status = failed.length === 0 ? 200 : (restoredCount === 0 ? 400 : 207)
    return res.status(status).json({ restored: restoredCount, failed })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron restaurar los archivos' })
  }
})

// POST /assets/export { ids, format?, width?, quality?, ... } — ZIP streaming
// con archiver, replicando el patrón de POST /:id/assets/export-bulk en
// projects.js (mismo uso de archiver + buildImageKitUrl/Transformations),
// pero resolviendo cada asset con resolveCompanyAssetForExport en vez de
// resolveProjectAssetForExport. A diferencia de projects.js, aquí SOLO se
// exporta: no hay auto-trash ni headers custom de "kept" — la limpieza
// post-export (si corresponde) la orquesta el cliente llamando
// POST /assets/bulk/trash después de confirmar la descarga (ver Task 14;
// motivo: apiSubmitDownload es form+iframe fire-and-forget y no puede leer
// headers de la respuesta, hallazgo de Task 10).
router.post('/assets/export', readAccess, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).filter(Boolean) : []
    if (ids.length === 0) return res.status(400).json({ error: 'No hay archivos seleccionados para exportar' })
    if (ids.length > 100) return res.status(400).json({ error: 'Máximo 100 archivos por exportación' })

    const resolved = []
    for (const assetId of ids) {
      const asset = await resolveCompanyAssetForExport(req.libraryAccess.companyId, { assetId })
      if (asset) resolved.push(asset)
    }
    if (resolved.length === 0) return res.status(404).json({ error: 'No se encontraron assets exportables' })

    const exportOptions = normalizeExportOptions(req.body || {})
    const baseName = slugifyFileBaseName(req.body?.fileName || 'biblioteca')
    const zipFileName = `${baseName}.zip`

    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"; filename*=UTF-8''${encodeURIComponent(zipFileName)}`)
    res.setHeader('Cache-Control', 'private, max-age=3600')

    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || 'No se pudo crear el zip' })
        return
      }
      res.destroy(error)
    })
    archive.pipe(res)

    for (let index = 0; index < resolved.length; index += 1) {
      const asset = resolved[index]
      const isSvg = asset.asset_kind === 'svg' || asset.mime_type === 'image/svg+xml'
      const exportUrl = isSvg
        ? asset.public_url
        : buildImageKitUrl(asset.storage_path, buildImageKitTransformations(exportOptions))
      if (!exportUrl) continue

      const upstream = await fetch(exportUrl)
      if (!upstream.ok) continue

      const entryFileName = buildExportFileName(
        asset.file_name,
        isSvg ? null : exportOptions.format,
        asset.mime_type,
        resolved.length > 1 ? `${baseName}-${index + 1}` : baseName
      )
      const buffer = Buffer.from(await upstream.arrayBuffer())
      archive.append(buffer, { name: entryFileName })
    }

    await archive.finalize()
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'No se pudo exportar el lote de imágenes' })
    }
    return res.destroy(error)
  }
})

// ---------------------------------------------------------------------------
// Papelera de carpetas: carpeta + descendientes + assets contenidos, todos
// con la MISMA marca de tiempo. Esa igualdad de timestamp es lo que permite
// que el restore identifique con precisión qué quedó trasheado por ESTE
// cascade (y no, por ejemplo, un asset que ya estaba en la papelera antes de
// que se trasheara la carpeta que lo contiene).
// ---------------------------------------------------------------------------

router.post('/folders/:folderId/trash', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  try {
    const { data: folders, error: foldersError } = await supabaseAdmin
      .from('asset_folders')
      .select('id, parent_folder_id, trashed_at')
      .eq('company_id', req.libraryAccess.companyId)
    if (foldersError) return res.status(500).json({ error: foldersError.message })

    const target = (folders || []).find((folder) => folder.id === req.params.folderId)
    if (!target) return res.status(404).json({ error: 'Carpeta no encontrada' })
    if (target.trashed_at) return res.status(400).json({ error: 'La carpeta ya está en la papelera' })

    const subtreeIds = collectFolderSubtreeIds(folders, req.params.folderId)
    const timestamp = new Date()
    const deleteAfter = new Date(timestamp.getTime() + 30 * 24 * 60 * 60 * 1000)

    const { data: trashedFolders, error: folderUpdateError } = await supabaseAdmin
      .from('asset_folders')
      .update({ trashed_at: timestamp.toISOString(), delete_after: deleteAfter.toISOString() })
      .in('id', subtreeIds)
      .eq('company_id', req.libraryAccess.companyId)
      .is('trashed_at', null)
      .select('id')
    if (folderUpdateError) return res.status(500).json({ error: folderUpdateError.message })

    const { data: trashedAssets, error: assetUpdateError } = await supabaseAdmin
      .from('project_assets')
      .update({
        trashed_at: timestamp.toISOString(),
        delete_after: deleteAfter.toISOString(),
        deleted_by: req.currentUser.id,
      })
      .in('folder_id', subtreeIds)
      .eq('company_id', req.libraryAccess.companyId)
      .is('trashed_at', null)
      .select('id')
    if (assetUpdateError) return res.status(500).json({ error: assetUpdateError.message })

    await logSecurityEvent(req, {
      action: 'library_folder_trashed',
      resourceType: 'asset_folder',
      resourceId: target.id,
      companyId: req.libraryAccess.companyId,
      metadata: {
        foldersTrashed: (trashedFolders || []).length,
        assetsTrashed: (trashedAssets || []).length,
      },
    })

    return res.json({
      trashed: true,
      foldersTrashed: (trashedFolders || []).length,
      assetsTrashed: (trashedAssets || []).length,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar la carpeta a la papelera' })
  }
})

router.post('/folders/:folderId/restore', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  try {
    const { data: folders, error: foldersError } = await supabaseAdmin
      .from('asset_folders')
      .select('id, parent_folder_id, trashed_at')
      .eq('company_id', req.libraryAccess.companyId)
    if (foldersError) return res.status(500).json({ error: foldersError.message })

    const target = (folders || []).find((folder) => folder.id === req.params.folderId)
    if (!target) return res.status(404).json({ error: 'Carpeta no encontrada' })
    if (!target.trashed_at) return res.status(400).json({ error: 'La carpeta no está en la papelera' })

    // Solo se restauran los miembros del MISMO cascade (misma marca de
    // tiempo que la carpeta objetivo) — ver comentario de sección arriba.
    const cascadeTimestamp = target.trashed_at
    const subtreeIds = collectFolderSubtreeIds(folders, req.params.folderId)

    const { data: restoredFolders, error: folderUpdateError } = await supabaseAdmin
      .from('asset_folders')
      .update({ trashed_at: null, delete_after: null })
      .in('id', subtreeIds)
      .eq('company_id', req.libraryAccess.companyId)
      .eq('trashed_at', cascadeTimestamp)
      .select('id')
    if (folderUpdateError) return res.status(500).json({ error: folderUpdateError.message })

    const { data: restoredAssets, error: assetUpdateError } = await supabaseAdmin
      .from('project_assets')
      .update({ trashed_at: null, delete_after: null })
      .in('folder_id', subtreeIds)
      .eq('company_id', req.libraryAccess.companyId)
      .eq('trashed_at', cascadeTimestamp)
      .select('id')
    if (assetUpdateError) return res.status(500).json({ error: assetUpdateError.message })

    // Si el padre de la carpeta restaurada sigue trasheado (o ya no existe),
    // la carpeta queda colgando de la raíz en vez de invisible bajo un padre
    // trasheado.
    if (target.parent_folder_id) {
      const parent = folders.find((folder) => folder.id === target.parent_folder_id)
      if (!parent || parent.trashed_at) {
        await supabaseAdmin
          .from('asset_folders')
          .update({ parent_folder_id: null })
          .eq('id', target.id)
          .eq('company_id', req.libraryAccess.companyId)
      }
    }

    await logSecurityEvent(req, {
      action: 'library_folder_restored',
      resourceType: 'asset_folder',
      resourceId: target.id,
      companyId: req.libraryAccess.companyId,
      metadata: {
        foldersRestored: (restoredFolders || []).length,
        assetsRestored: (restoredAssets || []).length,
      },
    })

    return res.json({
      restored: true,
      foldersRestored: (restoredFolders || []).length,
      assetsRestored: (restoredAssets || []).length,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo restaurar la carpeta' })
  }
})

// POST /trash/empty — purga definitiva de TODO lo trasheado en la empresa
// (assets + carpetas). Patrón calcado de purgeProjectAssets (projects.js):
// imagekit primero (deleteFromImageKit por imagekit_file_id), fallback a
// supabase.storage.remove solo para filas legacy de otros buckets — hoy
// TODOS los assets de biblioteca viven en ImageKit (Task 7), así que ese
// fallback en la práctica no debería ejercitarse contra datos nuevos.
// Errores de purga de storage se loggean pero NO bloquean el borrado de las
// filas (mismo criterio que permanent-delete de proyectos).
router.post('/trash/empty', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  try {
    const { data: assets, error: assetsError } = await supabaseAdmin
      .from('project_assets')
      .select('id, storage_bucket, storage_path, imagekit_file_id, file_size')
      .eq('company_id', req.libraryAccess.companyId)
      .not('trashed_at', 'is', null)
    if (assetsError) return res.status(500).json({ error: assetsError.message })

    let freedBytes = 0
    const purgeErrors = []
    const supabasePathsByBucket = new Map()

    for (const asset of assets || []) {
      if (asset.storage_bucket === 'imagekit') {
        const result = await deleteFromImageKit(asset.imagekit_file_id)
        if (!result.ok) purgeErrors.push(`imagekit:${asset.id}:${result.reason}`)
      } else if (asset.storage_bucket && asset.storage_path) {
        const list = supabasePathsByBucket.get(asset.storage_bucket) || []
        list.push(asset.storage_path)
        supabasePathsByBucket.set(asset.storage_bucket, list)
      }
      freedBytes += Number(asset.file_size) || 0
    }

    for (const [bucket, paths] of supabasePathsByBucket.entries()) {
      if (paths.length === 0) continue
      const { error: removeError } = await supabaseAdmin.storage.from(bucket).remove(paths)
      if (removeError) purgeErrors.push(`supabase:${bucket}:${removeError.message}`)
    }

    if (purgeErrors.length > 0) {
      console.warn(`[library] trash/empty company ${req.libraryAccess.companyId}: ${purgeErrors.length} purge errors: ${purgeErrors.join(', ')}`)
    }

    const assetIds = (assets || []).map((asset) => asset.id)
    if (assetIds.length > 0) {
      const { error: deleteAssetsError } = await supabaseAdmin
        .from('project_assets')
        .delete()
        .in('id', assetIds)
        .eq('company_id', req.libraryAccess.companyId)
      if (deleteAssetsError) return res.status(500).json({ error: deleteAssetsError.message })
    }

    const { data: deletedFolders, error: deleteFoldersError } = await supabaseAdmin
      .from('asset_folders')
      .delete()
      .eq('company_id', req.libraryAccess.companyId)
      .not('trashed_at', 'is', null)
      .select('id')
    if (deleteFoldersError) return res.status(500).json({ error: deleteFoldersError.message })

    const purged = assetIds.length

    await logSecurityEvent(req, {
      action: 'library_trash_emptied',
      resourceType: 'company',
      resourceId: req.libraryAccess.companyId,
      companyId: req.libraryAccess.companyId,
      metadata: {
        purged,
        freedBytes,
        foldersDeleted: (deletedFolders || []).length,
        purgeErrors: purgeErrors.length,
      },
    })

    return res.json({ purged, freedBytes, foldersDeleted: (deletedFolders || []).length })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo vaciar la papelera' })
  }
})

// PATCH /assets/:assetId { fileName } — renombrar. Declarado después de
// /assets/bulk/* y /assets/export a propósito (aunque Express no lo
// confundiría por profundidad de path, se respeta el orden pedido: rutas
// específicas antes que cualquier `/:param`).
router.patch('/assets/:assetId', rateLimiters.sensitiveAction, writeAccess, async (req, res) => {
  try {
    const fileName = validateAssetFileName(req.body?.fileName)
    if (!fileName) return res.status(400).json({ error: 'Nombre de archivo requerido' })

    const { data, error } = await supabaseAdmin
      .from('project_assets')
      .update({ file_name: fileName })
      .eq('id', req.params.assetId)
      .eq('company_id', req.libraryAccess.companyId)
      .select('*')
      .maybeSingle()
    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Archivo no encontrado' })

    return res.json({ asset: data })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo renombrar el archivo' })
  }
})

router.use((error, req, res, next) => {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'El archivo supera el límite de 30 MB', code: 'size_exceeded' })
  }
  next(error)
})

export default router
