// Pure helpers for the send-access feature. Side-effect free; testable in isolation.
//
// - canSendAccess: permission check (delegates to canSendAccessRanked — admin global;
//   company-admin/manager per shared company by rank; peer-rank forbidden; QA denied).
// - decideSendAccessAction: discriminates invite vs recovery by last_sign_in_at.
// - validateResetRequestRow: enforces 1h recovery TTL from password_reset_requests.

import { canSendAccessRanked } from './membershipPermissions.js'

export function canSendAccess({ actor, targetUserId, actorMemberships = [], targetMemberships = [] }) {
  return canSendAccessRanked({
    actor,
    targetUserId,
    actorMemberships,
    targetMemberships,
  })
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
