// Pure helpers for the send-access feature. Side-effect free; testable in isolation.
//
// - canSendAccess: permission check (admin global; manager per shared company).
// - decideSendAccessAction: discriminates invite vs recovery by last_sign_in_at.
// - validateResetRequestRow: enforces 1h recovery TTL from password_reset_requests.

export function canSendAccess({ actor, targetUserId, actorMemberships = [], targetMemberships = [] }) {
  if (!actor || !targetUserId) return false
  if (actor.id === targetUserId) return false // no self-targeting (DEC-2)

  if (actor.platformRole === 'admin') return true

  // QA is explicitly forbidden per spec §B.1, even if they happen to have
  // a manager membership row (defensive — shouldn't occur in practice).
  if (actor.platformRole === 'qa') return false

  // Manager path: actor must be 'manager' in at least one company shared with target.
  const actorManagerCompanies = new Set(
    (actorMemberships || [])
      .filter((m) => m && m.role === 'manager')
      .map((m) => m.companyId)
  )
  if (actorManagerCompanies.size === 0) return false

  const targetCompanyIds = new Set(
    (targetMemberships || []).map((m) => m && m.companyId).filter(Boolean)
  )

  for (const cid of actorManagerCompanies) {
    if (targetCompanyIds.has(cid)) return true
  }
  return false
}

const INVITE_TTL_SECONDS = 86_400 // 24h, matches Supabase email_otp_exp
const RECOVERY_TTL_SECONDS = 3_600 // 1h, enforced server-side via password_reset_requests

export function decideSendAccessAction({ authUser }) {
  if (!authUser) return { action: 'not_found', ttlSeconds: 0 }
  if (!authUser.last_sign_in_at) return { action: 'invite_resent', ttlSeconds: INVITE_TTL_SECONDS }
  return { action: 'reset_sent', ttlSeconds: RECOVERY_TTL_SECONDS }
}

export function validateResetRequestRow({ row, now }) {
  if (!row) return { valid: false, reason: 'no_request' }
  if (row.used_at) return { valid: false, reason: 'used' }
  const expiresAt = new Date(row.expires_at)
  if (Number.isNaN(expiresAt.getTime())) return { valid: false, reason: 'expired' }
  if (now >= expiresAt) return { valid: false, reason: 'expired' }
  return { valid: true, reason: null }
}
