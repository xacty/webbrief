// Pure permission helpers for password + session management on other users.
// Mirrors the rank-based pattern from membershipPermissions.js.
//
// canSetPassword: who can set/generate a password for whom
// canViewSessions: who can list a user's active sessions
// canRevealIp: who can reveal full IP of a session (vs masked)

import { getCompanyRoleRank } from '../../../shared/userRoles.js'

/**
 * Can the actor set/generate a password for the target?
 *
 * Rules:
 *   - platform-admin: always yes (except self — self uses recovery-email flow)
 *   - QA: always no (defensive guard)
 *   - Otherwise: actor must STRICTLY OUTRANK target in at least one shared company
 *     (peer-rank denied; cross-company denied; admin > manager > editor > workers)
 *   - Target with platformRole='admin' (platform-admin): only platform-admin can set
 *
 * @param {object} args
 * @param {object} args.actor                  { id, platformRole }
 * @param {object} args.target                 { id, platformRole }
 * @param {Array<{companyId, role}>} args.actorMemberships
 * @param {Array<{companyId, role}>} args.targetMemberships
 */
export function canSetPassword({ actor, target, actorMemberships = [], targetMemberships = [] }) {
  if (!actor || !target) return false
  if (actor.id === target.id) return false
  if (actor.platformRole === 'qa') return false
  if (actor.platformRole === 'admin') return true
  if (target.platformRole === 'admin') return false

  // Per-company rank check: actor must outrank target in at least one shared company.
  const actorByCompany = new Map()
  for (const m of actorMemberships) actorByCompany.set(m.companyId, m.role)
  if (actorByCompany.size === 0) return false

  for (const tm of targetMemberships) {
    const actorRole = actorByCompany.get(tm.companyId)
    if (!actorRole) continue
    if (getCompanyRoleRank(actorRole) > getCompanyRoleRank(tm.role)) return true
  }
  return false
}

/**
 * Can the actor list the target's active sessions?
 * Same gating as canSetPassword (managing a user's sessions = managing the user).
 */
export function canViewSessions(args) {
  return canSetPassword(args)
}

/**
 * Can the actor reveal a session's FULL IP (vs the masked display)?
 *
 * Rules:
 *   - platform-admin: yes (always)
 *   - company-admin (role='admin' in a shared company with target): yes
 *   - Anyone else (manager, editor, workers, QA): no — they see masked IP only
 *
 * Tighter than canViewSessions: managers can list sessions but not unmask IPs.
 */
export function canRevealIp({ actor, target, actorMemberships = [], targetMemberships = [] }) {
  if (!actor || !target) return false
  if (actor.platformRole === 'qa') return false
  if (actor.platformRole === 'admin') return true

  const adminCompanyIds = new Set(
    actorMemberships.filter((m) => m.role === 'admin').map((m) => m.companyId)
  )
  if (adminCompanyIds.size === 0) return false

  for (const tm of targetMemberships) {
    if (adminCompanyIds.has(tm.companyId)) return true
  }
  return false
}
