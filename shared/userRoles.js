export const PLATFORM_ROLE_ORDER = ['user', 'qa', 'admin']
export const COMPANY_ROLE_ORDER = ['manager', 'editor', 'content_writer', 'designer', 'developer']
export const MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER = ['editor', 'content_writer', 'designer', 'developer']
export const GLOBAL_PLATFORM_ROLES = new Set(PLATFORM_ROLE_ORDER.filter((role) => role !== 'user'))

export const PLATFORM_ROLE_LABELS = {
  admin: 'Admin',
  qa: 'QA',
  user: 'Usuario',
}

export const PLATFORM_ROLE_TITLES = {
  admin: 'Admin de plataforma',
  qa: 'QA',
  user: 'Usuario',
}

export const COMPANY_ROLE_LABELS = {
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
  if (currentUserPlatformRole === 'admin') {
    return COMPANY_ROLE_ORDER
  }

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
