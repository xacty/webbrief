export function getCompanyRole(currentUser, companyId = null) {
  if (!currentUser) return null

  if (companyId) {
    const exactMembership = currentUser.memberships?.find((membership) => membership.companyId === companyId)
    if (exactMembership?.role) return exactMembership.role
  }

  return currentUser.memberships?.[0]?.role || null
}

export function canManageUsersNav(currentUser) {
  return currentUser?.platformRole === 'admin'
    || currentUser?.memberships?.some((membership) => membership.role === 'manager')
}

export function canUseTrashNav(currentUser) {
  return currentUser?.platformRole === 'admin'
    || currentUser?.memberships?.some((membership) => membership.role === 'manager')
}

export function getInviteRoleOptions(currentUser, membershipRole) {
  if (currentUser?.platformRole === 'admin') {
    return ['manager', 'editor', 'content_writer', 'designer', 'developer']
  }

  if (membershipRole === 'manager') {
    return ['editor', 'content_writer', 'designer', 'developer']
  }

  if (membershipRole === 'editor') {
    return ['content_writer', 'designer', 'developer']
  }

  if (membershipRole === 'designer' || membershipRole === 'developer') {
    return ['editor', 'designer', 'developer']
  }

  return []
}

export function canInviteMembers(currentUser, membershipRole) {
  return getInviteRoleOptions(currentUser, membershipRole).length > 0
}

export function canCreateProjects(currentUser, membershipRole) {
  return currentUser?.platformRole === 'admin' || ['manager', 'editor'].includes(membershipRole)
}

export function canManageProjectLifecycle(currentUser, membershipRole) {
  return currentUser?.platformRole === 'admin' || ['manager', 'editor'].includes(membershipRole)
}

export function canManageCompanyLifecycle(currentUser, membershipRole) {
  return currentUser?.platformRole === 'admin' || membershipRole === 'manager'
}

export function getProjectEditorCapabilities(currentUser, companyId) {
  const companyRole = getCompanyRole(currentUser, companyId)
  const isAdmin = currentUser?.platformRole === 'admin'

  const canManageProjectMeta = isAdmin || ['manager', 'editor'].includes(companyRole)
  const canManageProjectStructure = isAdmin || ['manager', 'editor', 'content_writer', 'developer'].includes(companyRole)
  const canWriteContent = isAdmin || ['manager', 'editor', 'content_writer', 'designer', 'developer'].includes(companyRole)
  const canUseHandoff = isAdmin || ['manager', 'designer', 'developer'].includes(companyRole)
  const canSendToReview = isAdmin || ['manager', 'developer'].includes(companyRole)
  const canReviewDesignerProposals = isAdmin || ['manager', 'editor'].includes(companyRole)
  const isDesigner = !isAdmin && companyRole === 'designer'

  return {
    companyRole,
    canManageProjectMeta,
    canManageProjectStructure,
    canWriteContent,
    canUseHandoff,
    canSendToReview,
    canReviewDesignerProposals,
    isDesigner,
    canEditContentRules: canManageProjectMeta,
  }
}
