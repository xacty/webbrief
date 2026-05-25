// Pure permission helpers for password + session management on other users.
// Mirrors the rank-based pattern from membershipPermissions.js.
//
// canSetPassword: who can set/generate a password for whom
// canViewSessions: who can list a user's active sessions
// canRevealIp: who can reveal full IP of a session (vs masked)

import { getCompanyRoleRank } from '../../../shared/userRoles.js'

// Roles that are allowed to manage other users (set passwords, view sessions).
// This mirrors `canManageCompanyUsers` from projectAccess.js — keeping the gate
// inside the helper so route handlers cannot accidentally skip it.
// Editors and worker roles can NEVER reach the password/session surface, even
// if rank > target (e.g., editor rank 2 > designer rank 1).
const USER_MANAGER_ROLES = new Set(['admin', 'manager'])

/**
 * Can the actor set/generate a password for the target?
 *
 * Rules:
 *   - platform-admin: always yes (except self — self uses recovery-email flow)
 *   - QA: always no (defensive guard)
 *   - Otherwise: actor must (a) hold a user-manager role (admin|manager) in at least
 *     one shared company AND (b) STRICTLY OUTRANK target in that same company.
 *     Peer-rank denied; cross-company denied; editor→worker denied (editor is not
 *     a user-manager role even though rank 2 > 1).
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

  // Per-company gate: actor must be a user-manager (admin|manager) AND outrank target
  // in at least one shared company. The user-manager gate is what blocks editor→worker.
  const actorByCompany = new Map()
  for (const m of actorMemberships) actorByCompany.set(m.companyId, m.role)
  if (actorByCompany.size === 0) return false

  for (const tm of targetMemberships) {
    const actorRole = actorByCompany.get(tm.companyId)
    if (!actorRole) continue
    if (!USER_MANAGER_ROLES.has(actorRole)) continue
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
