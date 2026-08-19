import { supabase } from './supabase'

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

export async function apiFetch(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(options.headers || {})
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData

  if (!headers.has('Content-Type') && options.body && !isFormData) {
    headers.set('Content-Type', 'application/json')
  }

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  const response = await fetch(path, {
    ...options,
    headers,
  })

  const text = await response.text()
  const payload = text ? JSON.parse(text) : null

  if (!response.ok) {
    throw new ApiError(
      payload?.error || `Request failed with status ${response.status}`,
      response.status,
      payload
    )
  }

  return payload
}

function parseFileNameFromDisposition(disposition = '') {
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1])

  const basicMatch = disposition.match(/filename="([^"]+)"/i) || disposition.match(/filename=([^;]+)/i)
  return basicMatch?.[1] ? basicMatch[1].trim() : ''
}

export async function apiDownload(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(options.headers || {})

  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  const response = await fetch(path, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const text = await response.text()
    let payload = null
    try {
      payload = text ? JSON.parse(text) : null
    } catch {
      payload = null
    }

    throw new ApiError(
      payload?.error || `Request failed with status ${response.status}`,
      response.status,
      payload
    )
  }

  return {
    blob: await response.blob(),
    fileName: parseFileNameFromDisposition(response.headers.get('Content-Disposition') || '') || options.suggestedFileName || 'download',
    contentType: response.headers.get('Content-Type') || 'application/octet-stream',
  }
}

/**
 * Descarga un archivo autenticado SIN poner el token en la URL.
 *
 * Reemplaza a `apiDownloadToFile` (auditoria 2026-08, hallazgo M3), que armaba
 * `...?access_token=<JWT>` y disparaba una navegacion. Ese patron dejaba la
 * sesion viva escrita en el historial del navegador, en los logs de acceso de
 * Nginx (que guardan el query string) y en los logs del backend — cualquiera con
 * acceso a esos registros recuperaba una sesion usable (CWE-598).
 *
 * Aca el token viaja en la cabecera Authorization, como en cualquier otro
 * request, y el archivo se materializa como blob local.
 */
export async function apiDownloadBlob(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new ApiError('Sesion no disponible para descargar', 401, null)
  }

  const response = await fetch(path, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })

  if (!response.ok) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(payload?.error || 'No se pudo descargar el archivo', response.status, payload)
  }

  // El nombre del servidor gana sobre el sugerido cuando viene en la respuesta.
  const disposition = response.headers.get('content-disposition') || ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  let fileName = options.suggestedFileName || 'descarga'
  if (match?.[1]) {
    try {
      fileName = decodeURIComponent(match[1])
    } catch {
      fileName = match[1]
    }
  }

  const blob = await response.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Se revoca con un tick de gracia: algunos navegadores necesitan que la URL
  // siga viva un instante despues del click para completar la descarga.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000)
}

export async function apiSubmitDownload(path, fields = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new ApiError('Sesion no disponible para descargar', 401, null)
  }

  const iframeName = `download-frame-${Math.random().toString(36).slice(2)}`
  const iframe = document.createElement('iframe')
  iframe.name = iframeName
  iframe.style.display = 'none'

  const form = document.createElement('form')
  form.method = 'POST'
  form.action = path
  form.target = iframeName
  form.style.display = 'none'

  const payload = {
    ...fields,
    access_token: session.access_token,
  }

  Object.entries(payload).forEach(([key, value]) => {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = key
    input.value = typeof value === 'string' ? value : JSON.stringify(value)
    form.appendChild(input)
  })

  document.body.appendChild(iframe)
  document.body.appendChild(form)
  form.submit()

  window.setTimeout(() => {
    form.remove()
    iframe.remove()
  }, 2000)
}
