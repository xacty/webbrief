// Helpers de export de assets (proyecto y biblioteca): normalización de
// opciones de export, construcción de nombre de archivo y resolución del
// asset origen. Extraído verbatim de backend/src/routes/projects.js
// (Task 3, biblioteca de imágenes F1) para poder reutilizarse desde
// backend/src/routes/library.js sin duplicar lógica.
import { supabaseAdmin } from './supabase.js'
import { parseImageKitPathFromUrl, sanitizeFileName, slugifyFileBaseName } from './imagekit.js'

export function getExtensionFromMimeType(mimeType, fileName = '') {
  const normalizedName = String(fileName || '').toLowerCase()
  if (mimeType === 'image/jpeg' || normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) return 'jpg'
  if (mimeType === 'image/png' || normalizedName.endsWith('.png')) return 'png'
  if (mimeType === 'image/webp' || normalizedName.endsWith('.webp')) return 'webp'
  if (mimeType === 'image/svg+xml' || normalizedName.endsWith('.svg')) return 'svg'
  return 'bin'
}

function normalizeExportPreset(preset = '') {
  const normalizedPreset = String(preset || 'original').trim().toLowerCase()

  switch (normalizedPreset) {
    case 'web':
    case 'webp':
      return { width: 1600, height: 1600, fit: 'at_max', format: 'webp', quality: 85 }
    case 'jpg':
    case 'jpeg':
      return { width: 2400, height: 2400, fit: 'at_max', format: 'jpg', quality: 90 }
    case 'png':
      return { width: 2400, height: 2400, fit: 'at_max', format: 'png' }
    case 'original':
    default:
      return {}
  }
}

const EXPORT_CROP_MODES = new Set(['extract', 'pad_extract', 'pad_resize'])
const EXPORT_FOCUS_VALUES = new Set([
  'center', 'top', 'left', 'bottom', 'right',
  'top_left', 'top_right', 'bottom_left', 'bottom_right',
  'auto', 'face',
])

export function normalizeExportOptions(query = {}) {
  const presetOptions = normalizeExportPreset(query.preset)
  const width = Number(query.width)
  const height = Number(query.height)
  const quality = Number(query.quality)
  const fit = query.fit ? String(query.fit).trim() : presetOptions.fit
  const format = query.format ? String(query.format).trim().toLowerCase() : presetOptions.format
  const cropMode = query.cropMode ? String(query.cropMode).trim().toLowerCase() : ''
  const focus = query.focus ? String(query.focus).trim().toLowerCase() : ''
  const x = Number(query.x)
  const y = Number(query.y)

  return {
    width: Number.isFinite(width) && width > 0 ? width : presetOptions.width || null,
    height: Number.isFinite(height) && height > 0 ? height : presetOptions.height || null,
    quality: Number.isFinite(quality) && quality > 0 ? quality : presetOptions.quality || null,
    fit: fit || null,
    format: format || null,
    cropMode: EXPORT_CROP_MODES.has(cropMode) ? cropMode : null,
    x: Number.isFinite(x) && x >= 0 ? Math.round(x) : null,
    y: Number.isFinite(y) && y >= 0 ? Math.round(y) : null,
    focus: EXPORT_FOCUS_VALUES.has(focus) ? focus : null,
  }
}

export function buildExportFileName(fileName, requestedFormat = null, fallbackMimeType = '', requestedBaseName = '') {
  const safeName = sanitizeFileName(fileName || 'image')
  const baseName = requestedBaseName
    ? slugifyFileBaseName(requestedBaseName)
    : (safeName.replace(/\.[^.]+$/u, '') || 'image')
  const extension = requestedFormat || getExtensionFromMimeType(fallbackMimeType, safeName)
  return `${baseName}.${extension}`
}

export async function resolveProjectAssetForExport(projectId, { assetId = null, src = '' } = {}) {
  if (assetId) {
    const { data, error } = await supabaseAdmin
      .from('project_assets')
      .select('id, project_id, file_name, storage_path, imagekit_file_id, mime_type, asset_kind, public_url, width, height, render_inline')
      .eq('project_id', projectId)
      .eq('id', assetId)
      .maybeSingle()

    if (error) throw error
    return data
  }

  const parsedPath = parseImageKitPathFromUrl(src)
  if (!parsedPath) return null

  const { data, error } = await supabaseAdmin
    .from('project_assets')
    .select('id, project_id, file_name, storage_path, imagekit_file_id, mime_type, asset_kind, public_url, width, height, render_inline')
    .eq('project_id', projectId)
    .eq('storage_path', parsedPath)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function resolveCompanyAssetForExport(companyId, { assetId = null } = {}) {
  if (!assetId) return null
  const { data } = await supabaseAdmin
    .from('project_assets')
    .select('*')
    .eq('id', assetId)
    .eq('company_id', companyId)
    .maybeSingle()
  return data || null
}
