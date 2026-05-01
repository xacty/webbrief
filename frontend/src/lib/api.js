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

export async function apiDownloadToFile(path, options = {}) {
  const { blob, fileName } = await apiDownload(path, options)
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}
