// Cliente API de la biblioteca de imágenes por empresa (montada en
// /api/companies/:companyId/library, ver backend/src/routes/library.js).
import { apiFetch, ApiError } from './api'
import { supabase } from './supabase'

const base = (companyId) => `/api/companies/${companyId}/library`

export function fetchLibrary(companyId, { folderId, projectId, view, section } = {}) {
  const params = new URLSearchParams()
  // `section` (documents|briefs) es excluyente con carpeta/papelera — el
  // backend ya ignora folderId/view cuando viene, pero no tiene sentido
  // mandarlos.
  if (section) params.set('section', section)
  else {
    if (folderId) params.set('folderId', folderId)
    if (projectId) params.set('projectId', projectId)
    if (view) params.set('view', view)
  }
  const qs = params.toString()
  return apiFetch(`${base(companyId)}${qs ? `?${qs}` : ''}`)
}

export const createFolder = (companyId, body) => apiFetch(`${base(companyId)}/folders`, { method: 'POST', body: JSON.stringify(body) })
export const updateFolder = (companyId, folderId, body) => apiFetch(`${base(companyId)}/folders/${folderId}`, { method: 'PATCH', body: JSON.stringify(body) })
export const trashFolder = (companyId, folderId) => apiFetch(`${base(companyId)}/folders/${folderId}/trash`, { method: 'POST' })
export const restoreFolder = (companyId, folderId) => apiFetch(`${base(companyId)}/folders/${folderId}/restore`, { method: 'POST' })
export const moveAssets = (companyId, ids, folderId) => apiFetch(`${base(companyId)}/assets/bulk/move`, { method: 'POST', body: JSON.stringify({ ids, folderId }) })
export const trashAssets = (companyId, ids, { force } = {}) => apiFetch(`${base(companyId)}/assets/bulk/trash`, { method: 'POST', body: JSON.stringify({ ids, force }) })
export const restoreAssets = (companyId, ids) => apiFetch(`${base(companyId)}/assets/bulk/restore`, { method: 'POST', body: JSON.stringify({ ids }) })
export const renameAsset = (companyId, assetId, fileName) => apiFetch(`${base(companyId)}/assets/${assetId}`, { method: 'PATCH', body: JSON.stringify({ fileName }) })
export const emptyLibraryTrash = (companyId) => apiFetch(`${base(companyId)}/trash/empty`, { method: 'POST' })
export const searchLibrary = (companyId, q) => apiFetch(`${base(companyId)}/search?q=${encodeURIComponent(q)}`)

// Export de biblioteca — fetch→blob, NO apiSubmitDownload. apiSubmitDownload
// (lib/api.js) hace POST vía un <form> oculto enviado a un <iframe> oculto:
// fire-and-forget, no expone status ni blob a JS (hallazgo de Task 10 — ver
// el comentario de uploadLibraryAsset más abajo para el mismo patrón de
// bearer). LibraryExportModal necesita confirmar que la descarga resolvió
// 200 ANTES de decidir si manda los ids a la papelera (toggle "Enviar a
// papelera tras exportar"), así que acá sí hace falta fetch real: leemos la
// respuesta como blob y disparamos la descarga nosotros mismos con un
// <a download>, en vez de delegarle la descarga al navegador vía iframe.
export async function downloadLibraryExport(companyId, { ids, format, width, quality } = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = { 'Content-Type': 'application/json' }
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`

  const response = await fetch(`${base(companyId)}/assets/export`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ids, format, width, quality }),
  })

  if (!response.ok) {
    const text = await response.text()
    let payload = null
    try { payload = text ? JSON.parse(text) : null } catch { payload = null }
    throw new ApiError(payload?.error || `Error ${response.status}`, response.status, payload)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const dateStamp = new Date().toISOString().slice(0, 10)
  const link = document.createElement('a')
  link.href = url
  link.download = `biblioteca-${dateStamp}.zip`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)

  return { ok: true }
}

export async function uploadLibraryAsset({ companyId, folderId, file, onProgress, signal }) {
  const { data: { session } } = await supabase.auth.getSession()
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base(companyId)}/assets`)
    if (session?.access_token) xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let payload = null
      try { payload = xhr.responseText ? JSON.parse(xhr.responseText) : null } catch { payload = null }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload)
      // Rechaza con ApiError (misma clase que usa apiFetch) para que quien
      // consuma esta función maneje errores de forma coherente en toda la
      // app: err.message, err.status, err.payload (incluye `code` cuando el
      // backend lo manda, p. ej. quota_exceeded/size_exceeded).
      else reject(new ApiError(payload?.error || `Error ${xhr.status}`, xhr.status, payload))
    }
    xhr.onerror = () => reject(new ApiError('Error de red al subir', 0, null))
    if (signal) signal.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Aborted', 'AbortError')) })
    const form = new FormData()
    form.append('folderId', folderId || '')
    form.append('file', file)
    xhr.send(form)
  })
}
