// Cliente API de la biblioteca de imágenes por empresa (montada en
// /api/companies/:companyId/library, ver backend/src/routes/library.js).
import { apiFetch, apiSubmitDownload, ApiError } from './api'
import { supabase } from './supabase'

const base = (companyId) => `/api/companies/${companyId}/library`

export function fetchLibrary(companyId, { folderId, projectId, view } = {}) {
  const params = new URLSearchParams()
  if (folderId) params.set('folderId', folderId)
  if (projectId) params.set('projectId', projectId)
  if (view) params.set('view', view)
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
export const emptyLibraryTrash = (companyId) => apiFetch(`${base(companyId)}/trash/empty`, { method: 'POST' })
export const searchLibrary = (companyId, q) => apiFetch(`${base(companyId)}/search?q=${encodeURIComponent(q)}`)

// Contrato real de apiSubmitDownload (lib/api.js): siempre hace POST vía un
// <form> oculto enviado a un <iframe> oculto (no usa fetch), así que el
// navegador maneja la descarga nativamente a partir del header
// Content-Disposition que devuelva el backend. Por eso esta llamada NO
// recibe blob ni headers de respuesta en JS — no hay forma de leer acá un
// header como `X-Library-Kept`; si el backend necesita comunicar "kept"
// (assets no trasheados por estar referenciados) al exportar con
// trashAfterExport, debe hacerlo por otra vía (p. ej. un endpoint de status
// aparte), no a través de esta función. `body` se pasa como objeto plano:
// apiSubmitDownload arma un input oculto por cada key y sólo aplica
// JSON.stringify a los valores no-string (p. ej. `ids` como array), así que
// acá NO hay que stringificarlo antes de pasarlo. Mismo patrón que el
// apiSubmitDownload(path, { items, fileName, ... }) ya usado en
// ProjectEditor.jsx para el export-bulk del editor.
export const exportLibraryAssets = (companyId, body) => apiSubmitDownload(`${base(companyId)}/assets/export`, body)

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
