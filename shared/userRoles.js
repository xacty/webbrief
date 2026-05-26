export const PLATFORM_ROLE_ORDER = ['user', 'qa', 'admin']
export const COMPANY_ROLE_ORDER = ['admin', 'manager', 'editor', 'content_writer', 'designer', 'developer']
export const MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER = ['editor', 'content_writer', 'designer', 'developer']

// Company-admins can assign any company role including 'admin' (peer or new).
// Platform-admins effectively use the same list (they bypass company-level checks
// in the per-endpoint admin shortcut, so this list is what UI shows them too).
export const ADMIN_ASSIGNABLE_COMPANY_ROLE_ORDER = COMPANY_ROLE_ORDER

// Role rank for hierarchy comparisons. Higher = more authority.
// 'admin' (4) > 'manager' (3) > 'editor' (2) > worker roles (1, peers among themselves).
const COMPANY_ROLE_RANK = {
  admin: 4,
  manager: 3,
  editor: 2,
  content_writer: 1,
  designer: 1,
  developer: 1,
}

export function getCompanyRoleRank(role) {
  return COMPANY_ROLE_RANK[role] || 0
}

export const GLOBAL_PLATFORM_ROLES = new Set(PLATFORM_ROLE_ORDER.filter((role) => role !== 'user'))

export const PLATFORM_ROLE_LABELS = {
  admin: 'WeBrief Admin',
  qa: 'QA',
  user: 'Usuario',
}

export const PLATFORM_ROLE_TITLES = {
  admin: 'Admin de plataforma',
  qa: 'QA',
  user: 'Usuario',
}

export const COMPANY_ROLE_LABELS = {
  admin: 'Company Admin',
  manager: 'Manager',
  editor: 'Editor',
  content_writer: 'Content Writer',
  designer: 'Diseño',
  developer: 'Dev',
}

export const PLATFORM_ROLE_SET = new Set(PLATFORM_ROLE_ORDER)
export const COMPANY_ROLE_SET = new Set(COMPANY_ROLE_ORDER)

export function getPlatformRoleLabel(role) {
  return PLATFORM_ROLE_LABELS[role] || PLATFORM_ROLE_LABELS.user
}

export function getPlatformRoleTitle(role) {
  return PLATFORM_ROLE_TITLES[role] || PLATFORM_ROLE_TITLES.user
}

export function getCompanyRoleLabel(role) {
  return COMPANY_ROLE_LABELS[role] || 'Sin rol asignado'
}

export function isGlobalPlatformRole(role) {
  return GLOBAL_PLATFORM_ROLES.has(role)
}

export function normalizePlatformRole(role) {
  return PLATFORM_ROLE_SET.has(role) ? role : 'user'
}

export function isCompanyRole(role) {
  return COMPANY_ROLE_SET.has(role)
}

export function getInviteRoleOptionsForMembership(currentUserPlatformRole, membershipRole) {
  // Platform-admins can invite any role to any company.
  if (currentUserPlatformRole === 'admin') {
    return COMPANY_ROLE_ORDER
  }

  // Company-admin (the new role) can invite anything — they own the company.
  if (membershipRole === 'admin') {
    return ADMIN_ASSIGNABLE_COMPANY_ROLE_ORDER
  }

  // Manager can invite worker roles + editor, but NOT manager or admin.
  if (membershipRole === 'manager') {
    return MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER
  }

  if (membershipRole === 'editor') {
    return ['content_writer', 'designer', 'developer']
  }

  if (membershipRole === 'designer' || membershipRole === 'developer') {
    return ['editor', 'designer', 'developer']
  }

  return []
}
