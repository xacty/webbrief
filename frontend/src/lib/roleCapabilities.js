import {
  COMPANY_ROLE_ORDER,
  getInviteRoleOptionsForMembership,
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
    || currentUser?.memberships?.some((membership) => membership.role === 'manager')
}

export function canUseTrashNav(currentUser) {
  return isAdmin(currentUser)
    || currentUser?.memberships?.some((membership) => membership.role === 'manager')
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
  return isAdmin(currentUser) || ['manager', 'editor'].includes(membershipRole)
}

export function canManageProjectLifecycle(currentUser, membershipRole) {
  return isAdmin(currentUser) || ['manager', 'editor'].includes(membershipRole)
}

export function canManageCompanyLifecycle(currentUser, membershipRole) {
  return isAdmin(currentUser) || membershipRole === 'manager'
}

export function getProjectEditorCapabilities(currentUser, companyId) {
  const companyRole = getCompanyRole(currentUser, companyId)
  const admin = isAdmin(currentUser)

  const canManageProjectMeta = admin || ['manager', 'editor'].includes(companyRole)
  const canManageProjectStructure = admin || ['manager', 'editor', 'content_writer', 'developer'].includes(companyRole)
  const canWriteContent = admin || COMPANY_ROLE_ORDER.includes(companyRole)
  const canUseHandoff = admin || ['manager', 'designer', 'developer'].includes(companyRole)
  const canSendToReview = admin || ['manager', 'developer'].includes(companyRole)
  const canReviewDesignerProposals = admin || ['manager', 'editor'].includes(companyRole)
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
