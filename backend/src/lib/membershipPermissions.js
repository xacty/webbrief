// Pure, side-effect-free permission helpers for company_memberships
// role transitions. Side-effect free for unit testability.
//
// Rank hierarchy: admin(4) > manager(3) > editor(2) > workers(1).
// A platform-admin (global) implicitly outranks everyone in every company.

import { getCompanyRoleRank } from '../../../shared/userRoles.js'

/**
 * Can the actor manage (edit role / remove) a membership where the target
 * currently has `targetRole` in `companyId`?
 *
 * Rule: actor's role in the same company must strictly outrank target's role.
 * Platform-admin bypasses (returns true unconditionally).
 *
 * @param {object} args
 * @param {string} args.actorPlatformRole  e.g. 'admin' | 'user' | 'qa'
 * @param {Array<{companyId: string, role: string}>} args.actorMemberships
 * @param {string} args.companyId
 * @param {string} args.targetRole
 */
export function canManageMembershipRanked({ actorPlatformRole, actorMemberships, companyId, targetRole }) {
  if (actorPlatformRole === 'admin') return true
  const actorMembership = (actorMemberships || []).find((m) => m.companyId === companyId)
  if (!actorMembership) return false
  return getCompanyRoleRank(actorMembership.role) > getCompanyRoleRank(targetRole)
}

/**
 * Can the actor ASSIGN `role` in `companyId`?
 *
 * Rule: actor must strictly outrank the role they want to assign (or be platform-admin).
 * Prevents a manager from promoting someone to manager (peer) or admin.
 */
export function canAssignRoleRanked({ actorPlatformRole, actorMemberships, companyId, role }) {
  if (actorPlatformRole === 'admin') return true
  const actorMembership = (actorMemberships || []).find((m) => m.companyId === companyId)
  if (!actorMembership) return false
  return getCompanyRoleRank(actorMembership.role) > getCompanyRoleRank(role)
}

/**
 * Would changing this membership's role demote the LAST admin of a company?
 *
 * @param {object} args
 * @param {string} args.currentRole       Target's current role
 * @param {string} args.nextRole          Target's would-be new role
 * @param {string[]} args.companyAdminUserIds  user_ids of all current admins in the company
 * @param {string} args.targetUserId      The user being demoted
 * @returns {boolean} true if the change would leave the company with zero admins
 */
export function wouldLeaveCompanyWithoutAdmin({ currentRole, nextRole, companyAdminUserIds, targetUserId }) {
  if (currentRole !== 'admin') return false
  if (nextRole === 'admin') return false
  const otherAdmins = (companyAdminUserIds || []).filter((id) => id !== targetUserId)
  return otherAdmins.length === 0
}

/**
 * Updated send-access matrix (mirrors backend/src/lib/sendAccess.js extension).
 * Returns true if actor can send-access to target.
 *
 * Rule: actor outranks target in at least one shared company (or is platform-admin).
 * QA always denied. Self always denied.
 */
export function canSendAccessRanked({ actor, targetUserId, actorMemberships, targetMemberships }) {
  if (!actor || !targetUserId) return false
  if (actor.id === targetUserId) return false
  if (actor.platformRole === 'admin') return true
  if (actor.platformRole === 'qa') return false

  const sharedCompanies = new Set(
    (actorMemberships || []).map((m) => m.companyId)
  )

  for (const tm of (targetMemberships || [])) {
    if (!sharedCompanies.has(tm.companyId)) continue
    const actorMembership = (actorMemberships || []).find((m) => m.companyId === tm.companyId)
    if (!actorMembership) continue
    if (getCompanyRoleRank(actorMembership.role) > getCompanyRoleRank(tm.role)) return true
  }
  return false
}
