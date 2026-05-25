// Mirror of backend/src/lib/userAgent.js. Pure functions for displaying
// session devices and masking IPs in the UI.

export function parseUserAgent(ua) {
  if (!ua || typeof ua !== 'string') {
    return { browser: 'Desconocido', os: 'Desconocido' }
  }
  let browser = 'Otro'
  let m = ua.match(/\bEdg\/(\d+)/)
  if (m) browser = `Edge ${m[1]}`
  else if ((m = ua.match(/\bChrome\/(\d+)/))) browser = `Chrome ${m[1]}`
  else if ((m = ua.match(/\bFirefox\/(\d+)/))) browser = `Firefox ${m[1]}`
  else if ((m = ua.match(/Version\/(\d+).*Safari/))) browser = `Safari ${m[1]}`

  let os = 'Otro'
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/Mac OS X/.test(ua)) os = 'macOS'
  else if (/Windows NT/.test(ua)) os = 'Windows'
  else if (/Linux|X11/.test(ua)) os = 'Linux'

  return { browser, os }
}

export function formatDeviceLabel(ua) {
  const { browser, os } = parseUserAgent(ua)
  return `${browser} · ${os}`
}

// Format a Date or ISO string as "hace X minutos/horas/días" relative to now.
export function formatRelativeTime(iso) {
  if (!iso) return ''
  const date = iso instanceof Date ? iso : new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diffMs = Date.now() - date.getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'hace segundos'
  if (min < 60) return `hace ${min} ${min === 1 ? 'minuto' : 'minutos'}`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `hace ${hr} ${hr === 1 ? 'hora' : 'horas'}`
  const days = Math.floor(hr / 24)
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`
}
