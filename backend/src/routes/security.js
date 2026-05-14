import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { isMissingTableError } from '../lib/projectAccess.js'
import { requireAuth } from '../middleware/auth.js'
import { clearRateLimitBucket, getRateLimiterConfig } from '../middleware/security.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { clearSecurityBlockCache } from '../lib/securityBlocks.js'
import { getRequestLogContext, writeSecurityLog } from '../lib/securityLogger.js'
import { aggregateRateLimitBlocks, isRateLimitBlockActive } from './securityBlocksHelpers.js'

const router = Router()

router.use(requireAuth)
router.use((req, res, next) => {
  if (req.currentUser?.platformRole !== 'admin') {
    return res.status(403).json({ error: 'Solo admin puede acceder a seguridad' })
  }
  return next()
})

function parseLimit(value, fallback = 50, max = 200) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

function parseOffset(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.floor(parsed)
}

function parseDays(value, fallback = 7, max = 90) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(Math.floor(parsed), max)
}

function sinceIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function isAuthAuditUnavailable(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`
  return error?.code === 'PGRST202'
    || error?.code === '42883'
    || error?.code === '42P01'
    || message.includes('get_auth_audit_events')
    || message.includes('audit_log_entries')
    || message.includes('Could not find the function')
    || message.includes('schema cache')
}

function normalizeSecurityEvent(row) {
  return {
    id: row.id,
    source: 'webrief',
    createdAt: row.created_at,
    action: row.action,
    outcome: row.outcome || 'success',
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorRole: row.actor_role,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    requestId: row.request_id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    companyId: row.company_id,
    projectId: row.project_id,
    targetUserId: row.target_user_id,
    metadata: row.metadata || {},
  }
}

function normalizeAuthAuditEvent(row) {
  return {
    id: row.id,
    source: 'supabase_auth',
    createdAt: row.created_at,
    action: row.action || 'auth_event',
    outcome: row.outcome || 'success',
    actorUserId: row.actor_user_id,
    actorEmail: row.actor_email,
    actorRole: null,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    requestId: null,
    resourceType: 'auth',
    resourceId: row.actor_user_id || row.id,
    companyId: null,
    projectId: null,
    targetUserId: row.actor_user_id,
    metadata: row.metadata || {},
  }
}

function serializeBlock(row) {
  return {
    id: row.id,
    blockType: row.block_type,
    userId: row.user_id,
    userEmail: row.profile?.email || row.profiles?.email || '',
    userName: row.profile?.full_name || row.profiles?.full_name || '',
    ipAddress: row.ip_address,
    reason: row.reason,
    blockedBy: row.blocked_by,
    blockedByEmail: row.blocked_by_profile?.email || '',
    blockedAt: row.blocked_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedBy: row.revoked_by,
  }
}

function activeBlockFilter(query) {
  const now = new Date().toISOString()
  return query
    .is('revoked_at', null)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
}

async function fetchSecurityEvents({ days = 7, limit = 100, offset = 0, action = '', outcome = '', ip = '', userId = '' } = {}) {
  let query = supabaseAdmin
    .from('security_events')
    .select('id, actor_user_id, actor_email, actor_role, ip_address, user_agent, request_id, action, resource_type, resource_id, company_id, project_id, target_user_id, outcome, metadata, created_at')
    .gte('created_at', sinceIso(days))
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action) query = query.ilike('action', `%${action}%`)
  if (outcome) query = query.eq('outcome', outcome)
  if (ip) query = query.eq('ip_address', ip)
  if (userId) query = query.or(`actor_user_id.eq.${userId},target_user_id.eq.${userId}`)

  const { data, error } = await query
  if (error) throw error
  return (data || []).map(normalizeSecurityEvent)
}

async function fetchAuthAuditEvents({ days = 7, limit = 100, offset = 0 } = {}) {
  const { data, error } = await supabaseAdmin.rpc('get_auth_audit_events', {
    p_since: sinceIso(days),
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    if (isAuthAuditUnavailable(error)) {
      return {
        events: [],
        warning: 'Supabase Auth audit logs no están disponibles en Postgres o falta la RPC get_auth_audit_events.',
      }
    }
    throw error
  }

  return {
    events: (data || []).map(normalizeAuthAuditEvent),
    warning: null,
  }
}

async function fetchActiveBlocks() {
  const { data, error } = await activeBlockFilter(
    supabaseAdmin
      .from('security_blocks')
      .select('id, block_type, user_id, ip_address, reason, blocked_by, blocked_at, expires_at, revoked_at, revoked_by, profile:profiles!security_blocks_user_id_fkey(email, full_name), blocked_by_profile:profiles!security_blocks_blocked_by_fkey(email)')
      .order('blocked_at', { ascending: false })
  )

  if (error) {
    if (isMissingTableError(error, 'security_blocks')) {
      return {
        blocks: [],
        warning: 'La tabla security_blocks no está disponible; los bloqueos activos no se pueden mostrar todavía.',
      }
    }
    throw error
  }
  return { blocks: (data || []).map(serializeBlock), warning: null }
}

function isLoginAction(event) {
  return event.action === 'login' || event.action === 'user_logged_in' || event.action === 'token_refreshed'
}

function isFailure(event) {
  return ['failed', 'denied'].includes(event.outcome) || event.action.includes('invalid') || event.action.includes('failed')
}

function summarizeIpRows(events, blocks) {
  const byIp = new Map()
  for (const event of events) {
    if (!event.ipAddress) continue
    const current = byIp.get(event.ipAddress) || {
      ipAddress: event.ipAddress,
      eventCount: 0,
      failureCount: 0,
      loginCount: 0,
      users: new Map(),
      lastSeenAt: null,
      userAgents: new Set(),
      block: null,
    }
    current.eventCount += 1
    if (isFailure(event)) current.failureCount += 1
    if (isLoginAction(event)) current.loginCount += 1
    if (event.actorUserId || event.targetUserId || event.actorEmail) {
      const key = event.actorUserId || event.targetUserId || event.actorEmail
      current.users.set(key, {
        userId: event.actorUserId || event.targetUserId || null,
        email: event.actorEmail || '',
      })
    }
    if (event.userAgent) current.userAgents.add(event.userAgent)
    if (!current.lastSeenAt || event.createdAt > current.lastSeenAt) current.lastSeenAt = event.createdAt
    byIp.set(event.ipAddress, current)
  }

  for (const block of blocks) {
    if (!block.ipAddress) continue
    const current = byIp.get(block.ipAddress) || {
      ipAddress: block.ipAddress,
      eventCount: 0,
      failureCount: 0,
      loginCount: 0,
      users: new Map(),
      lastSeenAt: null,
      userAgents: new Set(),
      block: null,
    }
    current.block = block
    byIp.set(block.ipAddress, current)
  }

  return [...byIp.values()]
    .map((row) => ({
      ...row,
      users: [...row.users.values()].slice(0, 8),
      userAgents: [...row.userAgents].slice(0, 4),
    }))
    .sort((a, b) => (b.eventCount + b.failureCount) - (a.eventCount + a.failureCount))
}

function summarizeUserRows(events, blocks) {
  const byUser = new Map()
  for (const event of events) {
    const key = event.actorUserId || event.targetUserId || event.actorEmail
    if (!key) continue
    const current = byUser.get(key) || {
      userId: event.actorUserId || event.targetUserId || null,
      email: event.actorEmail || '',
      eventCount: 0,
      failureCount: 0,
      loginCount: 0,
      lastLoginAt: null,
      lastSeenAt: null,
      ips: new Set(),
      userAgents: new Set(),
      block: null,
    }
    current.eventCount += 1
    if (isFailure(event)) current.failureCount += 1
    if (isLoginAction(event)) {
      current.loginCount += 1
      if (!current.lastLoginAt || event.createdAt > current.lastLoginAt) current.lastLoginAt = event.createdAt
    }
    if (event.ipAddress) current.ips.add(event.ipAddress)
    if (event.userAgent) current.userAgents.add(event.userAgent)
    if (!current.lastSeenAt || event.createdAt > current.lastSeenAt) current.lastSeenAt = event.createdAt
    byUser.set(key, current)
  }

  for (const block of blocks) {
    if (!block.userId) continue
    const current = byUser.get(block.userId) || {
      userId: block.userId,
      email: block.userEmail,
      eventCount: 0,
      failureCount: 0,
      loginCount: 0,
      lastLoginAt: null,
      lastSeenAt: null,
      ips: new Set(),
      userAgents: new Set(),
      block: null,
    }
    current.email = current.email || block.userEmail
    current.block = block
    byUser.set(block.userId, current)
  }

  return [...byUser.values()]
    .map((row) => ({
      ...row,
      ips: [...row.ips].slice(0, 8),
      userAgents: [...row.userAgents].slice(0, 4),
    }))
    .sort((a, b) => (b.eventCount + b.failureCount) - (a.eventCount + a.failureCount))
}

router.get('/overview', async (req, res) => {
  try {
    const [webriefEvents, authAudit, blockResult] = await Promise.all([
      fetchSecurityEvents({ days: 7, limit: 500 }),
      fetchAuthAuditEvents({ days: 7, limit: 500 }),
      fetchActiveBlocks(),
    ])
    const activeBlocks = blockResult.blocks
    const events = [...webriefEvents, ...authAudit.events]
    const since24 = Date.now() - 24 * 60 * 60 * 1000
    const recent24 = events.filter((event) => new Date(event.createdAt).getTime() >= since24)
    const uniqueIps = new Set(events.map((event) => event.ipAddress).filter(Boolean))
    const failures24h = recent24.filter(isFailure)
    const logins24h = recent24.filter(isLoginAction)
    const criticalEvents = recent24.filter((event) => (
      event.action.includes('permanently_deleted')
      || event.action.includes('blocked')
      || event.action.includes('invalid')
      || event.action.includes('failed')
    ))

    return res.json({
      overview: {
        events24h: recent24.length,
        logins24h: logins24h.length,
        failures24h: failures24h.length,
        uniqueIps7d: uniqueIps.size,
        activeBlocks: activeBlocks.length,
        criticalEvents24h: criticalEvents.length,
      },
      topIps: summarizeIpRows(events, activeBlocks).slice(0, 6),
      recentCriticalEvents: criticalEvents.slice(0, 8),
      warnings: [authAudit.warning, blockResult.warning].filter(Boolean),
    })
  } catch (error) {
    writeSecurityLog('error', 'security_overview_failed', {
      ...getRequestLogContext(req),
      error: error.message,
    })
    return res.status(500).json({ error: error.message || 'No se pudo cargar seguridad' })
  }
})

router.get('/events', async (req, res) => {
  try {
    const days = parseDays(req.query.days)
    const limit = parseLimit(req.query.limit)
    const offset = parseOffset(req.query.offset)
    const filters = {
      action: String(req.query.action || '').trim(),
      outcome: String(req.query.outcome || '').trim(),
      ip: String(req.query.ip || '').trim(),
      userId: String(req.query.userId || '').trim(),
    }

    const [webriefEvents, authAudit] = await Promise.all([
      fetchSecurityEvents({ days, limit, offset, ...filters }),
      fetchAuthAuditEvents({ days, limit, offset }),
    ])
    const events = [...webriefEvents, ...authAudit.events]
      .filter((event) => !filters.outcome || event.outcome === filters.outcome)
      .filter((event) => !filters.action || event.action.includes(filters.action))
      .filter((event) => !filters.ip || event.ipAddress === filters.ip)
      .filter((event) => !filters.userId || event.actorUserId === filters.userId || event.targetUserId === filters.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit)

    return res.json({
      events,
      nextOffset: offset + limit,
      warnings: [authAudit.warning].filter(Boolean),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar eventos' })
  }
})

router.get('/users', async (req, res) => {
  try {
    const days = parseDays(req.query.days)
    const [webriefEvents, authAudit, blockResult] = await Promise.all([
      fetchSecurityEvents({ days, limit: 1000 }),
      fetchAuthAuditEvents({ days, limit: 1000 }),
      fetchActiveBlocks(),
    ])
    const users = summarizeUserRows([...webriefEvents, ...authAudit.events], blockResult.blocks)
    return res.json({ users, warnings: [authAudit.warning, blockResult.warning].filter(Boolean) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar usuarios de seguridad' })
  }
})

router.get('/ips', async (req, res) => {
  try {
    const days = parseDays(req.query.days)
    const [webriefEvents, authAudit, blockResult] = await Promise.all([
      fetchSecurityEvents({ days, limit: 1000 }),
      fetchAuthAuditEvents({ days, limit: 1000 }),
      fetchActiveBlocks(),
    ])
    const ips = summarizeIpRows([...webriefEvents, ...authAudit.events], blockResult.blocks)
    return res.json({ ips, warnings: [authAudit.warning, blockResult.warning].filter(Boolean) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar IPs' })
  }
})

router.post('/blocks', async (req, res) => {
  const { blockType, userId = null, ipAddress = null, reason, expiresAt = null } = req.body || {}
  const normalizedType = blockType === 'user' ? 'user' : blockType === 'ip' ? 'ip' : ''
  const normalizedReason = String(reason || '').trim().slice(0, 500)
  const normalizedIp = String(ipAddress || '').trim()

  if (!['user', 'ip'].includes(normalizedType)) return res.status(400).json({ error: 'blockType inválido' })
  if (!normalizedReason) return res.status(400).json({ error: 'reason es requerido' })
  if (normalizedType === 'user' && !userId) return res.status(400).json({ error: 'userId es requerido' })
  if (normalizedType === 'ip' && !normalizedIp) return res.status(400).json({ error: 'ipAddress es requerido' })
  if (normalizedType === 'user' && userId === req.currentUser.id) {
    return res.status(400).json({ error: 'No puedes bloquear tu propio usuario' })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('security_blocks')
      .insert({
        block_type: normalizedType,
        user_id: normalizedType === 'user' ? userId : null,
        ip_address: normalizedType === 'ip' ? normalizedIp : null,
        reason: normalizedReason,
        expires_at: expiresAt || null,
        blocked_by: req.currentUser.id,
      })
      .select('id, block_type, user_id, ip_address, reason, blocked_by, blocked_at, expires_at, revoked_at, revoked_by')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    clearSecurityBlockCache()
    await logSecurityEvent(req, {
      action: normalizedType === 'user' ? 'security_user_block_created' : 'security_ip_block_created',
      resourceType: 'security_block',
      resourceId: data.id,
      targetUserId: normalizedType === 'user' ? userId : null,
      metadata: {
        blockType: normalizedType,
        ipAddress: normalizedType === 'ip' ? normalizedIp : null,
        reason: normalizedReason,
        expiresAt: expiresAt || null,
      },
    })

    return res.status(201).json({ block: serializeBlock(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear el bloqueo' })
  }
})

router.delete('/blocks/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('security_blocks')
      .update({
        revoked_at: new Date().toISOString(),
        revoked_by: req.currentUser.id,
      })
      .eq('id', req.params.id)
      .is('revoked_at', null)
      .select('id, block_type, user_id, ip_address, reason, blocked_by, blocked_at, expires_at, revoked_at, revoked_by')
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Bloqueo no encontrado' })

    clearSecurityBlockCache()
    await logSecurityEvent(req, {
      action: 'security_block_revoked',
      resourceType: 'security_block',
      resourceId: data.id,
      targetUserId: data.user_id,
      metadata: { blockType: data.block_type, ipAddress: data.ip_address },
    })

    return res.json({ revoked: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo revocar el bloqueo' })
  }
})

// ---------------------------------------------------------------------------
// Unified blocks list (manual + rate-limit aggregation) — Plan E.5
// ---------------------------------------------------------------------------

router.get('/blocks', async (req, res) => {
  try {
    const days = parseDays(req.query.days, 1, 30) // last 24h default

    const [manualBlockResult, rateEventsResult] = await Promise.all([
      fetchActiveBlocks(),
      supabaseAdmin
        .from('security_events')
        .select('id, created_at, metadata')
        .eq('action', 'rate_limit_blocked')
        .gte('created_at', sinceIso(days))
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    if (rateEventsResult.error) throw rateEventsResult.error

    const rateBlocks = aggregateRateLimitBlocks(rateEventsResult.data || [])
    const now = new Date()
    const rateBlocksEnriched = rateBlocks.map((block) => {
      const config = getRateLimiterConfig(block.limiter)
      const blockMs = config?.blockMs || 0
      return {
        type: 'rate_limit',
        subject: block.key,
        limiter: block.limiter,
        lastBlockedAt: block.lastBlockedAt,
        violations: block.violations,
        eventCount: block.eventCount,
        currentlyBlocked: isRateLimitBlockActive({ lastBlockedAt: block.lastBlockedAt, now, blockMs }),
        blockMs,
      }
    })

    const manualBlocks = (manualBlockResult.blocks || []).map((row) => ({
      type: 'manual',
      id: row.id,
      blockType: row.blockType,
      subject: row.userEmail || row.userId || row.ipAddress || '(unknown)',
      reason: row.reason,
      since: row.blockedAt,
      expiresAt: row.expiresAt,
      blockedBy: row.blockedByEmail || row.blockedBy,
      currentlyBlocked: true,
    }))

    return res.json({
      manualBlocks,
      rateLimitBlocks: rateBlocksEnriched,
      warnings: [manualBlockResult.warning].filter(Boolean),
    })
  } catch (error) {
    writeSecurityLog('error', 'security_blocks_list_failed', {
      ...getRequestLogContext(req),
      error: error.message,
    })
    return res.status(500).json({ error: error.message || 'No se pudo cargar bloqueos' })
  }
})

router.post('/rate-limits/clear', async (req, res) => {
  try {
    const key = String(req.body?.key || '').trim()
    if (!key) {
      return res.status(400).json({ error: 'Body requiere field key' })
    }

    const memoryCleared = clearRateLimitBucket(key)

    // Best-effort: also delete persistent row (no-op when RATE_LIMIT_STORE=memory).
    let persistentCleared = false
    try {
      const { count, error } = await supabaseAdmin
        .from('rate_limit_buckets')
        .delete({ count: 'exact' })
        .eq('key', key)
      if (!error && count && count > 0) persistentCleared = true
    } catch {
      // swallow — persistent path is optional
    }

    await logSecurityEvent(req, {
      action: 'rate_limit_cleared',
      resourceType: 'rate_limit',
      metadata: { key, memoryCleared, persistentCleared },
    })

    return res.json({ cleared: true, memoryCleared, persistentCleared })
  } catch (error) {
    writeSecurityLog('error', 'rate_limit_clear_failed', {
      ...getRequestLogContext(req),
      error: error.message,
    })
    return res.status(500).json({ error: error.message || 'No se pudo limpiar el bloqueo' })
  }
})

// ---------------------------------------------------------------------------
// Application errors (technical/operator diagnostics) — admin-only
// ---------------------------------------------------------------------------

function parseLevel(value) {
  return value === 'warn' ? 'warn' : value === 'error' ? 'error' : ''
}

function parseSource(value) {
  const allowed = ['supabase_auth', 'route', 'external_api', 'unhandled', 'email']
  const normalized = String(value || '').trim()
  return allowed.includes(normalized) ? normalized : ''
}

router.get('/errors', async (req, res) => {
  try {
    const days = parseDays(req.query.days)
    const limit = parseLimit(req.query.limit)
    const offset = parseOffset(req.query.offset)
    const level = parseLevel(req.query.level)
    const source = parseSource(req.query.source)
    const search = String(req.query.search || '').trim().slice(0, 200)

    let query = supabaseAdmin
      .from('application_errors')
      .select('id, created_at, level, source, request_id, route, method, user_id, error_code, error_message, metadata')
      .gte('created_at', sinceIso(days))
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (level) query = query.eq('level', level)
    if (source) query = query.eq('source', source)
    if (search) query = query.ilike('error_message', `%${search}%`)

    const { data, error } = await query

    if (error) {
      if (isMissingTableError(error, 'application_errors')) {
        return res.json({
          errors: [],
          nextOffset: offset,
          warnings: ['La tabla application_errors aún no está aplicada. Aplicá supabase/migrations/20260514_application_errors.sql antes de usar esta vista.'],
        })
      }
      throw error
    }

    return res.json({
      errors: data || [],
      nextOffset: offset + limit,
      warnings: [],
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar errores técnicos' })
  }
})

router.get('/errors/:id', async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('application_errors')
      .select('*')
      .eq('id', req.params.id)
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error, 'application_errors')) {
        return res.status(503).json({ error: 'Tabla application_errors no disponible' })
      }
      throw error
    }
    if (!data) return res.status(404).json({ error: 'Error no encontrado' })
    return res.json({ error: data })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo cargar el error' })
  }
})

export default router
