import {
  COMPANY_ROLE_ORDER,
  getInviteRoleOptionsForMembership,
  getCompanyRoleRank,
} from '../../../shared/userRoles.js'

// Admin check that works both in normal mode and in role-preview mode.
// realPlatformRole is set by applyRolePreview() when admin previews another role,
// so admin always retains full capabilities regardless of the active preview.
export function isAdmin(currentUser) {
  return currentUser?.platformRole === 'admin' || currentUser?.realPlatformRole === 'admin'
}

export function getCompanyRole(currentUser, companyId = null) {
  if (!currentUser) return null

  if (companyId) {
    const exactMembership = currentUser.memberships?.find((membership) => membership.companyId === companyId)
    if (exactMembership?.role) return exactMembership.role
  }

  return currentUser.memberships?.[0]?.role || null
}

export function canManageUsersNav(currentUser) {
  return isAdmin(currentUser)
    || currentUser?.memberships?.some((membership) => membership.role === 'admin' || membership.role === 'manager')
}

export function canUseTrashNav(currentUser) {
  return isAdmin(currentUser)
    || currentUser?.memberships?.some((membership) => membership.role === 'admin' || membership.role === 'manager')
}

export function canUseSecurityNav(currentUser) {
  return isAdmin(currentUser)
}

// realPlatformRole is set during admin role-preview mode; check it first
// so admin previewing as another role retains the ability to seed test companies.
export function canCreateTestCompany(currentUser) {
  const platformRole = currentUser?.realPlatformRole || currentUser?.platformRole
  return platformRole === 'admin' || platformRole === 'qa'
}

export function getInviteRoleOptions(currentUser, membershipRole) {
  // Use realPlatformRole when in preview so invite options reflect true admin level.
  const platformRole = currentUser?.realPlatformRole || currentUser?.platformRole
  return getInviteRoleOptionsForMembership(platformRole, membershipRole)
}

export function canInviteMembers(currentUser, membershipRole) {
  return getInviteRoleOptions(currentUser, membershipRole).length > 0
}

export function canCreateProjects(currentUser, membershipRole) {
  return isAdmin(currentUser) || ['admin', 'manager', 'editor'].includes(membershipRole)
}

export function canManageProjectLifecycle(currentUser, membershipRole) {
  return isAdmin(currentUser) || ['admin', 'manager', 'editor'].includes(membershipRole)
}

export function canManageCompanyLifecycle(currentUser, membershipRole) {
  return isAdmin(currentUser) || membershipRole === 'admin' || membershipRole === 'manager'
}

// "Enviar acceso" — admin global can target any user except self;
// company-admin or manager can target users with LOWER company role in the same company;
// peer-rank (admin↔admin, manager↔manager) is forbidden;
// QA, editor, content_writer, designer, developer → cannot send access.
// Mirrors backend canSendAccess in backend/src/lib/sendAccess.js for symmetric gating.
export function canSendAccess(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false
  if (currentUser.id === targetUser.id) return false

  if (isAdmin(currentUser)) return true

  const platformRole = currentUser.realPlatformRole || currentUser.platformRole
  if (platformRole === 'qa') return false

  // Map actor's memberships to a {companyId: role} dict
  const actorRoleByCompany = new Map()
  for (const m of (currentUser.memberships || [])) {
    actorRoleByCompany.set(m.companyId, m.role)
  }
  if (actorRoleByCompany.size === 0) return false

  // For each target company, check if actor outranks target there.
  for (const targetCompany of (targetUser.companies || [])) {
    const actorRole = actorRoleByCompany.get(targetCompany.companyId)
    if (!actorRole) continue
    if (getCompanyRoleRank(actorRole) > getCompanyRoleRank(targetCompany.role)) return true
  }
  return false
}

// "Can the current user promote anyone to company-admin in this company?"
// Used by UI to gate the 'Admin' option in role selects.
export function canPromoteToAdmin(currentUser, companyId) {
  if (isAdmin(currentUser)) return true
  const m = (currentUser?.memberships || []).find((mm) => mm.companyId === companyId)
  return m?.role === 'admin'
}

export function getProjectEditorCapabilities(currentUser, companyId) {
  const companyRole = getCompanyRole(currentUser, companyId)
  const admin = isAdmin(currentUser)

  const canManageProjectMeta = admin || ['admin', 'manager', 'editor'].includes(companyRole)
  const canManageProjectStructure = admin || ['admin', 'manager', 'editor', 'content_writer', 'developer'].includes(companyRole)
  const canWriteContent = admin || COMPANY_ROLE_ORDER.includes(companyRole)
  const canUseHandoff = admin || ['admin', 'manager', 'designer', 'developer'].includes(companyRole)
  const canSendToReview = admin || ['admin', 'manager', 'developer'].includes(companyRole)
  const canReviewDesignerProposals = admin || ['admin', 'manager', 'editor'].includes(companyRole)
  const isDesignerRole = !admin && companyRole === 'designer'

  return {
    companyRole,
    canManageProjectMeta,
    canManageProjectStructure,
    canWriteContent,
    canUseHandoff,
    canSendToReview,
    canReviewDesignerProposals,
    isDesigner: isDesignerRole,
    canEditContentRules: canManageProjectMeta,
  }
}

/**
 * canCreateCompany — gate the "Crear empresa" CTA across the app.
 * Single source of truth so AppShell's WorkspaceSwitcher and CompaniesPage
 * can't drift. Includes QA users (who can create test companies) and any
 * manager-tier membership.
 */
export function canCreateCompany(user) {
  if (!user) return false
  if (isAdmin(user)) return true
  if (canCreateTestCompany(user)) return true
  const memberships = Array.isArray(user.memberships) ? user.memberships : []
  return memberships.some((m) => m.role === 'admin' || m.role === 'manager')
}
