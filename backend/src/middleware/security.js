import { randomUUID } from 'node:crypto'
import { logApplicationError } from '../lib/applicationErrors.js'
import { consumePersistentRateLimit } from '../lib/rateLimitStore.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { getActiveSecurityBlock } from '../lib/securityBlocks.js'
import { getRequestLogContext, writeSecurityLog } from '../lib/securityLogger.js'

const DEFAULT_FRONTEND_URL = 'http://localhost:5173'
const rateBuckets = new Map()
let lastBucketCleanup = Date.now()

function splitOrigins(value = '') {
  return String(value)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function buildCorsOptions() {
  const allowedOrigins = new Set([
    process.env.FRONTEND_URL || DEFAULT_FRONTEND_URL,
    ...splitOrigins(process.env.CORS_ORIGINS),
  ])

  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true)
      if (allowedOrigins.has(origin)) return callback(null, true)
      return callback(new Error('CORS_ORIGIN_NOT_ALLOWED'))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Cron-Secret', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    maxAge: 600,
  }
}

export function requestContext(req, res, next) {
  const incomingRequestId = typeof req.headers['x-request-id'] === 'string'
    ? req.headers['x-request-id'].trim().slice(0, 120)
    : ''
  req.requestId = incomingRequestId || randomUUID()
  req.clientIp = getClientIp(req)
  res.setHeader('X-Request-Id', req.requestId)
  return next()
}

export function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site')

  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains')
  }

  return next()
}

export function requestTimeout(timeoutMs = 30_000) {
  return (req, res, next) => {
    req.setTimeout(timeoutMs)
    return next()
  }
}

export async function enforceIpSecurityBlock(req, res, next) {
  if (!req.path?.startsWith('/api') || req.path === '/api/health') return next()

  const block = await getActiveSecurityBlock(req, { ipAddress: req.clientIp || getClientIp(req) })
  if (!block) return next()

  writeSecurityLog('warn', 'security_ip_blocked_request', {
    ...getRequestLogContext(req),
    blockId: block.id,
    reason: block.reason,
  })

  return res.status(403).json({
    error: 'Acceso bloqueado por seguridad',
    blockId: block.id,
  })
}

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }
  return req.ip || req.socket?.remoteAddress || 'unknown-ip'
}

function normalizeKeyPart(value) {
  return String(value || 'anonymous')
    .trim()
    .toLowerCase()
    .slice(0, 180)
}

function cleanupBuckets(now) {
  if (now - lastBucketCleanup < 60_000) return
  lastBucketCleanup = now

  for (const [key, bucket] of rateBuckets.entries()) {
    const violationExpiresAt = bucket.violationExpiresAt || 0
    if (
      bucket.resetAt < now &&
      (!bucket.blockedUntil || bucket.blockedUntil < now) &&
      (!violationExpiresAt || violationExpiresAt < now)
    ) {
      rateBuckets.delete(key)
    }
  }
}

function rateLimitResponse(req, res, retryAfterSeconds, message, fields = {}) {
  res.setHeader('Retry-After', String(retryAfterSeconds))
  writeSecurityLog('warn', 'rate_limit_blocked', {
    ...getRequestLogContext(req),
    retryAfterSeconds,
    ...fields,
  })

  // Persist to security_events for cross-event analytics (Plan E.1).
  // Best-effort: logSecurityEvent already swallows write failures in-band;
  // the .catch here only guards against a rejected promise so the 429 path
  // is never blocked.
  logSecurityEvent(req, {
    action: 'rate_limit_blocked',
    resourceType: 'rate_limit',
    outcome: 'denied',
    metadata: {
      limiter: fields.limiter || null,
      key: fields.key || null,
      retryAfterSeconds,
      violations: fields.violations || 0,
    },
  }).catch(() => {})

  return res.status(429).json({ error: message })
}

function applyRateLimitHeaders(res, { max, count, resetAt }) {
  res.setHeader('X-RateLimit-Limit', String(max))
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, max - count)))
  res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)))
}

function consumeMemoryRateLimit({
  key,
  now,
  windowMs,
  max,
  blockMs,
  maxBlockMs,
  violationTtlMs,
  progressive,
}) {
  const current = rateBuckets.get(key)
  const bucket = current && current.resetAt > now
    ? current
    : {
        count: 0,
        resetAt: now + windowMs,
        blockedUntil: current?.blockedUntil || 0,
        violations: current?.violationExpiresAt > now ? current.violations || 0 : 0,
        violationExpiresAt: current?.violationExpiresAt || 0,
      }

  if (bucket.blockedUntil > now) {
    return {
      blocked: true,
      alreadyBlocked: true,
      retryAfterSeconds: Math.ceil((bucket.blockedUntil - now) / 1000),
      count: bucket.count,
      resetAt: bucket.resetAt,
      violations: bucket.violations || 0,
    }
  }

  bucket.count += 1
  bucket.resetAt = bucket.resetAt || now + windowMs

  if (bucket.count > max) {
    bucket.violations = progressive ? (bucket.violations || 0) + 1 : 1
    bucket.violationExpiresAt = now + violationTtlMs
    const multiplier = progressive ? Math.min(2 ** (bucket.violations - 1), 16) : 1
    const nextBlockMs = Math.min(blockMs * multiplier, maxBlockMs)
    bucket.blockedUntil = now + nextBlockMs
    rateBuckets.set(key, bucket)
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil(nextBlockMs / 1000),
      count: bucket.count,
      resetAt: bucket.resetAt,
      violations: bucket.violations,
      blockMs: nextBlockMs,
    }
  }

  rateBuckets.set(key, bucket)
  return {
    blocked: false,
    count: bucket.count,
    resetAt: bucket.resetAt,
    violations: bucket.violations || 0,
  }
}

export function createRateLimit({
  name,
  windowMs,
  max,
  blockMs = windowMs,
  maxBlockMs = 24 * 60 * 60_000,
  violationTtlMs = 24 * 60 * 60_000,
  progressive = true,
  message = 'Demasiadas solicitudes. Intentá nuevamente más tarde.',
  keyParts = () => [],
}) {
  return async (req, res, next) => {
    const now = Date.now()
    cleanupBuckets(now)

    const rawParts = [name, getClientIp(req), ...keyParts(req)]
    const key = rawParts.map(normalizeKeyPart).join(':')

    let result = null
    try {
      result = await consumePersistentRateLimit({
        key,
        windowMs,
        max,
        blockMs,
        maxBlockMs,
        violationTtlMs,
        progressive,
      })
    } catch (error) {
      writeSecurityLog('warn', 'rate_limit_store_failed', {
        ...getRequestLogContext(req),
        limiter: name,
        error: error.message,
      })
    }

    if (!result) {
      result = consumeMemoryRateLimit({
        key,
        now,
        windowMs,
        max,
        blockMs,
        maxBlockMs,
        violationTtlMs,
        progressive,
      })
    }

    const resetAtMs = Number(result.resetAtMs || result.resetAt || now + windowMs)
    applyRateLimitHeaders(res, { max, count: Number(result.count || 0), resetAt: resetAtMs })

    if (result.blocked) {
      return rateLimitResponse(req, res, Number(result.retryAfterSeconds || 1), message, {
        limiter: name,
        key,
        limit: max,
        count: Number(result.count || 0),
        violations: Number(result.violations || 0),
        alreadyBlocked: Boolean(result.alreadyBlocked),
        blockMs: result.blockMs || null,
      })
    }

    return next()
  }
}

export function resetRateLimitBucketsForTests() {
  if (process.env.NODE_ENV === 'test') {
    rateBuckets.clear()
    lastBucketCleanup = Date.now()
  }
}

export function publicAntiScrapingHeaders(req, res, next) {
  res.setHeader('Cache-Control', 'no-store, max-age=0')
  res.setHeader('Pragma', 'no-cache')
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive')
  return next()
}

export const rateLimiters = {
  publicRead: createRateLimit({
    name: 'public-read',
    windowMs: 60_000,
    max: 90,
    blockMs: 5 * 60_000,
    maxBlockMs: 60 * 60_000,
  }),
  publicTokenProbe: createRateLimit({
    name: 'public-token-probe',
    windowMs: 10 * 60_000,
    max: 40,
    blockMs: 15 * 60_000,
    maxBlockMs: 6 * 60 * 60_000,
  }),
  publicMutation: createRateLimit({
    name: 'public-mutation',
    windowMs: 10 * 60_000,
    max: 20,
    blockMs: 15 * 60_000,
    maxBlockMs: 6 * 60 * 60_000,
    keyParts: (req) => [req.params?.token, req.body?.authorEmail || req.body?.reviewerEmail || req.body?.respondentEmail],
  }),
  publicUpload: createRateLimit({
    name: 'public-upload',
    windowMs: 15 * 60_000,
    max: 8,
    blockMs: 30 * 60_000,
    maxBlockMs: 12 * 60 * 60_000,
    keyParts: (req) => [req.params?.token],
  }),
  inviteUser: createRateLimit({
    name: 'invite-user',
    windowMs: 60 * 60_000,
    max: 20,
    blockMs: 60 * 60_000,
    maxBlockMs: 12 * 60 * 60_000,
    keyParts: (req) => [req.currentUser?.id, req.body?.companyId],
  }),
  shareLink: createRateLimit({
    name: 'share-link',
    windowMs: 10 * 60_000,
    max: 20,
    blockMs: 15 * 60_000,
    maxBlockMs: 6 * 60 * 60_000,
    keyParts: (req) => [req.currentUser?.id, req.params?.id],
  }),
  sensitiveAction: createRateLimit({
    name: 'sensitive-action',
    windowMs: 10 * 60_000,
    max: 40,
    blockMs: 15 * 60_000,
    maxBlockMs: 6 * 60 * 60_000,
    keyParts: (req) => [req.currentUser?.id, req.params?.id || req.params?.companyId],
  }),
  authenticatedUpload: createRateLimit({
    name: 'authenticated-upload',
    windowMs: 10 * 60_000,
    max: 30,
    blockMs: 15 * 60_000,
    maxBlockMs: 6 * 60 * 60_000,
    keyParts: (req) => [req.currentUser?.id, req.params?.id],
  }),
  passwordReset: createRateLimit({
    name: 'password-reset',
    windowMs: 60 * 60_000,
    max: 5,
    blockMs: 15 * 60_000,
    maxBlockMs: 6 * 60 * 60_000,
    keyParts: (req) => [req.currentUser?.id, req.params?.id],
  }),
}

export async function securityErrorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)

  if (error?.message === 'CORS_ORIGIN_NOT_ALLOWED') {
    writeSecurityLog('warn', 'cors_origin_denied', getRequestLogContext(req))
    return res.status(403).json({ error: 'Origen no permitido' })
  }

  if (error?.type === 'entity.too.large') {
    writeSecurityLog('warn', 'payload_too_large', getRequestLogContext(req))
    return res.status(413).json({ error: 'Payload demasiado grande' })
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    writeSecurityLog('warn', 'invalid_json', getRequestLogContext(req))
    return res.status(400).json({ error: 'JSON inválido' })
  }

  if (error?.name === 'MulterError') {
    writeSecurityLog('warn', 'upload_rejected', {
      ...getRequestLogContext(req),
      multerCode: error.code,
    })
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Archivo demasiado grande' })
    }
    return res.status(400).json({ error: 'Upload inválido' })
  }

  writeSecurityLog('error', 'unhandled_request_error', {
    ...getRequestLogContext(req),
    error: error?.message || error,
  })

  // Persist to application_errors for operator diagnostics.
  // If the error already has applicationErrorId (e.g., from wrapSupabaseAuthCall),
  // reuse it; otherwise persist a fresh row.
  const errorId = error?.applicationErrorId
    || await logApplicationError(req, error, {
      source: 'unhandled',
      metadata: { handler: 'securityErrorHandler' },
    })

  return res.status(500).json({
    error: 'No se pudo procesar la solicitud',
    errorId,
  })
}
