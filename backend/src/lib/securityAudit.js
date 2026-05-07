import { supabaseAdmin } from './supabase.js'
import { isMissingTableError } from './projectAccess.js'
import { getRequestLogContext, writeSecurityLog } from './securityLogger.js'

let securityEventsTableAvailable = true
let securityEventsRetryAt = 0

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for']
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }
  return req.ip || req.socket?.remoteAddress || null
}

function sanitizeMetadata(metadata = {}) {
  const clone = { ...metadata }
  delete clone.token
  delete clone.accessToken
  delete clone.access_token
  delete clone.password
  delete clone.authorization
  return clone
}

export async function logSecurityEvent(req, {
  action,
  resourceType,
  resourceId = null,
  companyId = null,
  projectId = null,
  targetUserId = null,
  outcome = 'success',
  metadata = {},
}) {
  if (!securityEventsTableAvailable) {
    if (Date.now() < securityEventsRetryAt) return null
    securityEventsTableAvailable = true
  }

  const currentUser = req.currentUser || null
  const payload = {
    actor_user_id: currentUser?.id || null,
    actor_email: currentUser?.email || null,
    actor_role: currentUser?.platformRole || null,
    ip_address: getClientIp(req),
    user_agent: req.headers['user-agent'] || null,
    request_id: req.requestId || null,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    company_id: companyId,
    project_id: projectId,
    target_user_id: targetUserId,
    outcome,
    metadata: sanitizeMetadata(metadata),
  }

  const { data, error } = await supabaseAdmin
    .from('security_events')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    if (isMissingTableError(error, 'security_events')) {
      securityEventsTableAvailable = false
      securityEventsRetryAt = Date.now() + 30_000
      writeSecurityLog('warn', 'security_audit_table_missing', {
        ...getRequestLogContext(req),
        action,
        resourceType,
        resourceId,
      })
      return null
    }

    writeSecurityLog('warn', 'security_audit_write_failed', {
      ...getRequestLogContext(req),
      action,
      resourceType,
      resourceId,
      error: error.message,
    })
    return null
  }

  return data
}
