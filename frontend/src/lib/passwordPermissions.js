// Mirror of backend/src/lib/passwordPermissions.js for symmetric UI gating.
// Backend remains source of truth — these are UI hints, not security boundaries.

import { getCompanyRoleRank } from '../../../shared/userRoles.js'

// Mirrors backend USER_MANAGER_ROLES. Editor and worker roles cannot set
// passwords / view sessions even if their rank > target.
const USER_MANAGER_ROLES = new Set(['admin', 'manager'])

function platformRoleOf(user) {
  return user?.realPlatformRole || user?.platformRole
}

export function canSetPassword(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false
  if (currentUser.id === targetUser.id) return false
  const ap = platformRoleOf(currentUser)
  if (ap === 'qa') return false
  if (ap === 'admin') return true
  if (platformRoleOf(targetUser) === 'admin') return false

  const actorByCompany = new Map()
  for (const m of (currentUser.memberships || [])) actorByCompany.set(m.companyId, m.role)
  if (actorByCompany.size === 0) return false

  for (const tc of (targetUser.companies || [])) {
    const actorRole = actorByCompany.get(tc.companyId)
    if (!actorRole) continue
    if (!USER_MANAGER_ROLES.has(actorRole)) continue
    if (getCompanyRoleRank(actorRole) > getCompanyRoleRank(tc.role)) return true
  }
  return false
}

export function canRevealIp(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false
  const ap = platformRoleOf(currentUser)
  if (ap === 'qa') return false
  if (ap === 'admin') return true

  const adminCompanyIds = new Set(
    (currentUser.memberships || []).filter((m) => m.role === 'admin').map((m) => m.companyId)
  )
  if (adminCompanyIds.size === 0) return false

  for (const tc of (targetUser.companies || [])) {
    if (adminCompanyIds.has(tc.companyId)) return true
  }
  return false
}
