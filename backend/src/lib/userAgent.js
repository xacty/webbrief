// Lightweight user-agent parser. No external dependency.
// Returns { browser, os } suitable for showing "Chrome 121 · macOS" in the UI.
//
// Rules in priority order: Edge before Chrome, Chrome before Safari (because
// Edge UA contains "Chrome"; Chrome UA contains "Safari").

export function parseUserAgent(ua) {
  if (!ua || typeof ua !== 'string') {
    return { browser: 'Desconocido', os: 'Desconocido' }
  }

  let browser = 'Otro'
  // Order matters — Edg first, then Chrome, then Firefox, then Safari (Safari has weakest signature).
  let m = ua.match(/\bEdg\/(\d+)/)
  if (m) {
    browser = `Edge ${m[1]}`
  } else if ((m = ua.match(/\bChrome\/(\d+)/))) {
    browser = `Chrome ${m[1]}`
  } else if ((m = ua.match(/\bFirefox\/(\d+)/))) {
    browser = `Firefox ${m[1]}`
  } else if ((m = ua.match(/Version\/(\d+).*Safari/))) {
    browser = `Safari ${m[1]}`
  }

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

// Mask an IP (v4 or v6) for display to lower-privilege actors.
// v4: 192.168.1.100 → 192.168.*.*
// v6: 2001:db8::1234 → 2001:db8:***
export function maskIp(ip) {
  if (!ip || typeof ip !== 'string') return ''
  if (ip.includes(':')) {
    // IPv6
    const parts = ip.split(':')
    if (parts.length <= 2) return `${parts[0]}:***`
    return `${parts[0]}:${parts[1]}:***`
  }
  const parts = ip.split('.')
  if (parts.length !== 4) return ip // not a v4, return as-is
  return `${parts[0]}.${parts[1]}.*.*`
}
