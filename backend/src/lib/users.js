import { supabaseAdmin } from './supabase.js'

const PLATFORM_ROLES = new Set(['admin', 'user', 'qa'])

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function getSetPasswordRedirectUrl() {
  return `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/set-password`
}

async function findAuthUserByEmail(email) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  })

  if (error) throw error

  return (data?.users || []).find((user) => normalizeEmail(user.email) === email) || null
}

function normalizePlatformRole(platformRole) {
  return PLATFORM_ROLES.has(platformRole) ? platformRole : 'user'
}

async function updateExistingProfile(profile, fullName, platformRole) {
  const updates = {}

  if (fullName?.trim()) {
    updates.full_name = fullName.trim()
  }

  if (platformRole && profile.platform_role !== 'admin') {
    updates.platform_role = normalizePlatformRole(platformRole)
  }

  if (Object.keys(updates).length === 0) return profile

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', profile.id)
    .select('id, email, full_name, platform_role')
    .single()

  if (error) throw error
  return data
}

export async function ensureUserProfile({ email, fullName, platformRole = 'user' }) {
  const normalizedEmail = normalizeEmail(email)
  const normalizedPlatformRole = normalizePlatformRole(platformRole)
  const timestamp = new Date().toISOString()

  const { data: existingProfile, error: profileLookupError } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, platform_role')
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (profileLookupError) throw profileLookupError

  if (existingProfile) {
    const profile = await updateExistingProfile(existingProfile, fullName, normalizedPlatformRole)
    return {
      userId: profile.id,
      email: profile.email,
      fullName: profile.full_name || '',
      platformRole: profile.platform_role,
      inviteSent: false,
      existingUser: true,
    }
  }

  const redirectTo = getSetPasswordRedirectUrl()
  const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
    redirectTo,
    data: {
      full_name: fullName || '',
    },
  })

  let authUser = data?.user || null
  let inviteSent = Boolean(authUser)

  if (inviteError || !authUser?.id) {
    authUser = await findAuthUserByEmail(normalizedEmail)
    inviteSent = false

    if (!authUser?.id) {
      throw inviteError || new Error('No se pudo crear o encontrar el usuario')
    }
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert({
      id: authUser.id,
      email: normalizedEmail,
      full_name: fullName || authUser.user_metadata?.full_name || '',
      platform_role: normalizedPlatformRole,
      updated_at: timestamp,
    })
    .select('id, email, full_name, platform_role')
    .single()

  if (profileError) throw profileError

  return {
    userId: profile.id,
    email: profile.email,
    fullName: profile.full_name || '',
    platformRole: profile.platform_role,
    inviteSent,
    existingUser: false,
  }
}

export async function assignUserToCompany({ companyId, userId, role }) {
  const timestamp = new Date().toISOString()

  const { error } = await supabaseAdmin
    .from('company_memberships')
    .upsert({
      company_id: companyId,
      user_id: userId,
      role,
      updated_at: timestamp,
    }, {
      onConflict: 'company_id,user_id',
    })

  if (error) throw error
}

export async function inviteUserToCompany({ email, fullName, companyId, role, platformRole = 'user' }) {
  const profile = await ensureUserProfile({ email, fullName, platformRole })
  await assignUserToCompany({ companyId, userId: profile.userId, role })

  return {
    id: profile.userId,
    email: profile.email,
    fullName: profile.fullName,
    role,
    companyId,
    inviteSent: profile.inviteSent,
    existingUser: profile.existingUser,
  }
}
