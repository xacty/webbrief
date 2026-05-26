import { createHash } from 'node:crypto'
import { supabaseAdmin } from '../lib/supabase.js'
import { getActiveSecurityBlock } from '../lib/securityBlocks.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { getRequestLogContext, writeSecurityLog } from '../lib/securityLogger.js'

async function loadCurrentUser(user) {
  const [
    { data: profile, error: profileError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, avatar_url, platform_role')
      .eq('id', user.id)
      .maybeSingle(),
    supabaseAdmin
      .from('company_memberships')
      .select('company_id, role')
      .eq('user_id', user.id),
  ])

  if (profileError) {
    throw profileError
  }
  if (membershipsError) {
    throw membershipsError
  }

  return {
    id: user.id,
    email: profile?.email || user.email || '',
    fullName: profile?.full_name || user.user_metadata?.full_name || '',
    avatarUrl: profile?.avatar_url || '',
    platformRole: profile?.platform_role || 'user',
    memberships: (memberships || []).map((membership) => ({
      companyId: membership.company_id,
      companyName: '',
      role: membership.role,
    })),
  }
}

export async function requireAuth(req, res, next) {
  // Bypass para endpoints de cron / system que usan shared secret
  const cronSecret = process.env.LIFECYCLE_CRON_SECRET
  const headerSecret = req.headers['x-cron-secret']
  if (cronSecret && headerSecret === cronSecret) {
    req.currentUser = { id: null, email: 'system@cron', platformRole: 'system', memberships: [] }
    req.accessToken = null
    return next()
  }

  const authHeader = req.headers.authorization
  const queryToken = typeof req.query?.access_token === 'string' ? req.query.access_token : ''
  const bodyToken = typeof req.body?.access_token === 'string' ? req.body.access_token : ''
  const bearerToken = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : ''
  const token = bearerToken || queryToken || bodyToken

  if (!token) {
    writeSecurityLog('warn', 'auth_token_missing', getRequestLogContext(req))
    await logSecurityEvent(req, {
      action: 'auth_token_missing',
      resourceType: 'auth',
      outcome: 'denied',
    })
    return res.status(401).json({ error: 'Token no proporcionado' })
  }

  // MCP token fast-path: long-lived tokens with prefix mcpt_
  if (token.startsWith('mcpt_')) {
    const hash = createHash('sha256').update(token).digest('hex')

    const { data: mcpToken, error: mcpError } = await supabaseAdmin
      .from('mcp_tokens')
      .select('id, user_id')
      .eq('token_hash', hash)
      .is('revoked_at', null)
      .maybeSingle()

    if (mcpError || !mcpToken) {
      writeSecurityLog('warn', 'mcp_token_invalid', getRequestLogContext(req))
      await logSecurityEvent(req, {
        action: 'mcp_token_invalid',
        resourceType: 'mcp_token',
        outcome: 'denied',
        metadata: { reason: mcpError?.message || 'not_found_or_revoked' },
      })
      return res.status(401).json({ error: 'Token MCP invalido o revocado' })
    }

    try {
      req.currentUser = await loadCurrentUser({ id: mcpToken.user_id })
    } catch (err) {
      writeSecurityLog('warn', 'mcp_token_user_load_failed', {
        ...getRequestLogContext(req),
        error: err.message,
      })
      return res.status(401).json({ error: 'No se pudo cargar el usuario del token MCP' })
    }

    req.accessToken = null
    req.mcpTokenId = mcpToken.id

    const userBlock = await getActiveSecurityBlock(req, {
      userId: req.currentUser.id,
      ipAddress: req.clientIp,
    })
    if (userBlock?.blockType === 'user') {
      writeSecurityLog('warn', 'security_user_blocked_request', {
        ...getRequestLogContext(req),
        blockId: userBlock.id,
        reason: userBlock.reason,
      })
      await logSecurityEvent(req, {
        action: 'blocked_user_request_denied',
        resourceType: 'security_block',
        resourceId: userBlock.id,
        targetUserId: req.currentUser.id,
        outcome: 'denied',
        metadata: { reason: userBlock.reason },
      })
      return res.status(403).json({ error: 'Usuario bloqueado por seguridad', blockId: userBlock.id })
    }

    // Non-blocking: audit + last_used_at (only for unblocked requests)
    Promise.all([
      supabaseAdmin
        .from('mcp_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', mcpToken.id),
      logSecurityEvent(req, {
        action: 'mcp_token_used',
        resourceType: 'mcp_token',
        resourceId: mcpToken.id,
        targetUserId: mcpToken.user_id,
        outcome: 'success',
      }),
    ]).catch(() => {})

    return next()
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error || !data?.user) {
      writeSecurityLog('warn', 'auth_token_invalid', {
        ...getRequestLogContext(req),
        authError: error?.message || 'missing_user',
      })
      await logSecurityEvent(req, {
        action: 'auth_token_invalid',
        resourceType: 'auth',
        outcome: 'denied',
        metadata: { reason: error?.message || 'missing_user' },
      })
      return res.status(401).json({ error: 'Token invalido o expirado' })
    }

    req.currentUser = await loadCurrentUser(data.user)
    req.accessToken = token
    const userBlock = await getActiveSecurityBlock(req, {
      userId: req.currentUser.id,
      ipAddress: req.clientIp,
    })

    if (userBlock?.blockType === 'user') {
      writeSecurityLog('warn', 'security_user_blocked_request', {
        ...getRequestLogContext(req),
        blockId: userBlock.id,
        reason: userBlock.reason,
      })
      await logSecurityEvent(req, {
        action: 'blocked_user_request_denied',
        resourceType: 'security_block',
        resourceId: userBlock.id,
        targetUserId: req.currentUser.id,
        outcome: 'denied',
        metadata: { reason: userBlock.reason },
      })
      return res.status(403).json({ error: 'Usuario bloqueado por seguridad', blockId: userBlock.id })
    }

    return next()
  } catch (error) {
    writeSecurityLog('warn', 'auth_validation_failed', {
      ...getRequestLogContext(req),
      error: error.message,
    })
    await logSecurityEvent(req, {
      action: 'auth_validation_failed',
      resourceType: 'auth',
      outcome: 'failed',
      metadata: { reason: error.message },
    })
    return res.status(401).json({ error: error.message || 'No se pudo validar la sesion' })
  }
}
