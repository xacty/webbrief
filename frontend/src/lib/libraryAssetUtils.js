// Helpers puros compartidos entre AssetGrid (grid + vista lista),
// AssetInfoModal y LibraryPage/LibraryToolbar — formato legible de
// mime/tamaño/fecha, categorización por tipo (filtro del punto 3) y
// comparadores de orden sobre `data.assets`. Sin dependencias de React ni
// de la API — funciones puras, fáciles de razonar y de mover si hiciera
// falta testearlas en el futuro.

const MIME_LABELS = {
  'image/webp': 'WebP',
  'image/png': 'PNG',
  'image/svg+xml': 'SVG',
  'image/gif': 'GIF',
  'image/jpeg': 'JPEG',
}

export function mimeLabel(mimeType) {
  if (!mimeType) return '—'
  return MIME_LABELS[mimeType] || mimeType.replace('image/', '').toUpperCase()
}

// Categoría para el filtro de tipo (punto 3: Todas/Fotos/PNG/SVG/GIF). La
// ingesta SIEMPRE convierte fotos a WebP q80 (ver CONTEXT.min target=library)
// y nunca persiste el original — "Fotos" agrupa jpeg+webp para cubrir tanto
// el resultado normal de la ingesta como filas legacy jpeg si existieran.
export function assetTypeCategory(asset) {
  const mime = asset?.mime_type || ''
  if (mime === 'image/svg+xml') return 'svg'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg' || mime === 'image/webp') return 'photo'
  return 'other'
}

export function formatDimensions(width, height) {
  return width && height ? `${width} × ${height} px` : '—'
}

export function formatDateEs(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ImageKit-hosted assets get an on-the-fly transform; Supabase Storage
// assets (SVG passthrough) are served as-is — mismo criterio que
// Lightbox.jsx's lightboxImageUrl, generalizado por ancho para que AssetGrid
// (thumb de grilla/mini-thumb de lista) y AssetInfoModal (preview chico)
// puedan pedir cada uno el tamaño que necesitan sin duplicar la función.
export function assetImageUrl(asset, width) {
  if (!asset?.public_url) return null
  if (asset.storage_bucket !== 'imagekit') return asset.public_url
  const separator = asset.public_url.includes('?') ? '&' : '?'
  return `${asset.public_url}${separator}tr=w-${width}`
}

function compareAssets(a, b, field) {
  switch (field) {
    case 'size':
      return (a.file_size || 0) - (b.file_size || 0)
    case 'dimensions':
      return (a.width || 0) * (a.height || 0) - (b.width || 0) * (b.height || 0)
    case 'format':
      return mimeLabel(a.mime_type).localeCompare(mimeLabel(b.mime_type), 'es')
    case 'date':
      return new Date(a.created_at || 0) - new Date(b.created_at || 0)
    case 'name':
    default:
      return (a.file_name || '').localeCompare(b.file_name || '', 'es')
  }
}

// Orden client-side sobre `data.assets` (punto 3 — nunca toca el fetch).
// `field` es uno de name|date|size|dimensions|format; `dir` asc|desc.
export function sortAssets(assets, field, dir) {
  const sorted = [...(assets || [])].sort((a, b) => compareAssets(a, b, field))
  return dir === 'desc' ? sorted.reverse() : sorted
}

export function filterAssetsByType(assets, typeFilter) {
  if (!typeFilter || typeFilter === 'all') return assets || []
  return (assets || []).filter((asset) => assetTypeCategory(asset) === typeFilter)
}
