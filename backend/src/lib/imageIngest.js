// Conversión automática en la ingesta de imágenes (F0; ver spec de biblioteca §4):
// - Fotos (JPEG/WebP) → WebP q80, encajadas en 2560px (pre-transformación en el
//   upload de ImageKit: el original solo transita por memoria, nunca se persiste).
// - PNG (logos/capturas/gráficos) → sin pérdida: conserva el formato y solo se
//   redimensiona si supera 2560px.
// - GIF y SVG → passthrough: animaciones y vectores no se tocan.
// Tope 2560px = "big image threshold" de WordPress; c-at_max evita el upscale
// de imágenes más chicas (mismo patrón que la URL de display del editor).
import { uploadToImageKit } from './imagekit.js'

export const MAX_INGEST_WIDTH = 2560
export const PHOTO_WEBP_QUALITY = 80
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024

const PHOTO_MIMES = new Set(['image/jpeg', 'image/webp'])
const PASSTHROUGH_MIMES = new Set(['image/gif', 'image/svg+xml'])

export function decideUploadConversion({ mimeType = '', size = 0 } = {}) {
  if (size > MAX_UPLOAD_BYTES) return { ok: false, reason: 'size_exceeded' }
  if (PHOTO_MIMES.has(mimeType)) return { ok: true, action: 'photo-webp' }
  if (mimeType === 'image/png') return { ok: true, action: 'png-resize' }
  if (PASSTHROUGH_MIMES.has(mimeType)) return { ok: true, action: 'passthrough' }
  return { ok: false, reason: 'unsupported_mime' }
}

export function buildIngestPreTransform(action) {
  const box = `w-${MAX_INGEST_WIDTH},h-${MAX_INGEST_WIDTH},c-at_max`
  if (action === 'photo-webp') return `${box},f-webp,q-${PHOTO_WEBP_QUALITY}`
  if (action === 'png-resize') return box
  return null
}

export function adjustFileNameForAction(fileName = 'imagen', action) {
  if (action !== 'photo-webp') return fileName
  const base = String(fileName).replace(/\.[^.]+$/u, '')
  return `${base || 'imagen'}.webp`
}

export function mimeTypeForAction(originalMime, action) {
  return action === 'photo-webp' ? 'image/webp' : originalMime
}

export async function uploadWithIngest({
  buffer,
  fileName,
  folder,
  tags,
  mimeType,
  size,
  uploadFn = uploadToImageKit,
}) {
  const decision = decideUploadConversion({ mimeType, size: size ?? buffer?.byteLength ?? 0 })
  if (!decision.ok) return { ok: false, reason: decision.reason }

  const finalName = adjustFileNameForAction(fileName, decision.action)
  const upload = await uploadFn({
    buffer,
    fileName: finalName,
    folder,
    tags,
    preTransformation: buildIngestPreTransform(decision.action),
  })

  return {
    ok: true,
    action: decision.action,
    converted: decision.action !== 'passthrough',
    finalName,
    mimeType: mimeTypeForAction(mimeType, decision.action),
    upload,
  }
}
