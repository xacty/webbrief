const SENSITIVE_KEYS = new Set([
  'authorization',
  'access_token',
  'accessToken',
  'token',
  'password',
  'secret',
])

function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [
      key,
      SENSITIVE_KEYS.has(key) ? '[redacted]' : sanitizeValue(entryValue),
    ])
  )
}

export function getRequestLogContext(req) {
  return {
    requestId: req.requestId || null,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.clientIp || req.ip || req.socket?.remoteAddress || null,
    userAgent: req.headers?.['user-agent'] || null,
    actorUserId: req.currentUser?.id || null,
    actorRole: req.currentUser?.platformRole || null,
  }
}

export function writeSecurityLog(level, event, fields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...sanitizeValue(fields),
  }

  const line = JSON.stringify(payload)
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}
