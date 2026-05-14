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
  return isAdmin(currentUser) || ['manager', 'editor'].includes(membershipRole)
}

export function canManageProjectLifecycle(currentUser, membershipRole) {
  return isAdmin(currentUser) || ['manager', 'editor'].includes(membershipRole)
}

export function canManageCompanyLifecycle(currentUser, membershipRole) {
  return isAdmin(currentUser) || membershipRole === 'manager'
}

// "Enviar acceso" — admin can target any user except self;
// manager can target users who share at least one company where the actor is manager;
// QA, editor, content_writer, designer, developer, user → no.
// Mirrors backend canSendAccess in backend/src/lib/sendAccess.js for symmetric gating.
export function canSendAccess(currentUser, targetUser) {
  if (!currentUser || !targetUser) return false
  if (currentUser.id === targetUser.id) return false

  if (isAdmin(currentUser)) return true

  const platformRole = currentUser.realPlatformRole || currentUser.platformRole
  if (platformRole === 'qa') return false

  const actorManagerCompanies = new Set(
    (currentUser.memberships || [])
      .filter((m) => m.role === 'manager')
      .map((m) => m.companyId)
  )
  if (actorManagerCompanies.size === 0) return false

  const targetCompanies = new Set(
    (targetUser.companies || []).map((c) => c.companyId).filter(Boolean)
  )

  for (const cid of actorManagerCompanies) {
    if (targetCompanies.has(cid)) return true
  }
  return false
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
