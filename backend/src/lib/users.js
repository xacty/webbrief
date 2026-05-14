import { supabaseAdmin } from './supabase.js'
import { normalizePlatformRole } from '../../../shared/userRoles.js'
import { sendInviteEmail } from './authEmails.js'

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function getSetPasswordRedirectUrl() {
  return `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/set-password`
}

const AUTH_USERS_PAGE_SIZE = 200
const AUTH_USERS_MAX_PAGES = 100 // 20k user cap; raise if needed

export async function findAuthUserByEmailPaginated(client, email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  for (let page = 1; page <= AUTH_USERS_MAX_PAGES; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: AUTH_USERS_PAGE_SIZE,
    })
    if (error) throw error

    const users = data?.users || []
    const match = users.find((user) => normalizeEmail(user.email) === normalized)
    if (match) return match
    if (users.length < AUTH_USERS_PAGE_SIZE) return null
  }

  return null
}

// Convenience wrapper bound to supabaseAdmin (preserves existing import sites).
async function findAuthUserByEmail(email) {
  return findAuthUserByEmailPaginated(supabaseAdmin, email)
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

export function decideEnsureProfileAction({ authUser, profile }) {
  if (!authUser) {
    return { action: 'invite', userId: null }
  }
  if (!authUser.last_sign_in_at) {
    return { action: 'reinvite', userId: authUser.id }
  }
  return { action: 'assign_existing', userId: authUser.id }
}

export async function ensureUserProfile({ email, fullName, platformRole = 'user' }) {
  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    throw new Error('email es requerido')
  }
  const normalizedPlatformRole = normalizePlatformRole(platformRole)
  const timestamp = new Date().toISOString()

  // Look up both sources of truth in parallel.
  const [authUser, existingProfileResult] = await Promise.all([
    findAuthUserByEmail(normalizedEmail),
    supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, platform_role')
      .eq('email', normalizedEmail)
      .maybeSingle(),
  ])

  if (existingProfileResult.error) throw existingProfileResult.error
  const existingProfile = existingProfileResult.data || null

  const decision = decideEnsureProfileAction({ authUser, profile: existingProfile })
  const redirectTo = getSetPasswordRedirectUrl()

  // -------- Case A: fresh invite --------
  if (decision.action === 'invite') {
    const { data, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
      redirectTo,
      data: { full_name: fullName || '' },
    })

    if (inviteError || !data?.user?.id) {
      // Race: another invite landed between our lookups and now. Re-resolve once.
      const fallback = await findAuthUserByEmail(normalizedEmail)
      if (!fallback?.id) {
        throw inviteError || new Error('No se pudo crear el usuario')
      }
      // Treat as Case B (reinvite) on the retry path.
      return await handleReinvite(fallback, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp)
    }

    await upsertProfileRow(data.user.id, normalizedEmail, fullName, data.user, normalizedPlatformRole, timestamp)

    return {
      userId: data.user.id,
      email: normalizedEmail,
      fullName: fullName || data.user.user_metadata?.full_name || '',
      platformRole: normalizedPlatformRole,
      action: 'invited',
      inviteSent: true,
      existingUser: false,
    }
  }

  // -------- Case B: reinvite (auth user exists, never activated) --------
  if (decision.action === 'reinvite') {
    return await handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp)
  }

  // -------- Case C/D: assign existing (auth user active) --------
  if (existingProfile) {
    const updatedProfile = await updateExistingProfile(existingProfile, fullName, normalizedPlatformRole)
    return {
      userId: updatedProfile.id,
      email: updatedProfile.email,
      fullName: updatedProfile.full_name || '',
      platformRole: updatedProfile.platform_role,
      action: 'assigned_existing',
      inviteSent: false,
      existingUser: true,
    }
  }

  // Active auth user but no profile row — upsert one.
  await upsertProfileRow(authUser.id, normalizedEmail, fullName, authUser, normalizedPlatformRole, timestamp)
  return {
    userId: authUser.id,
    email: normalizedEmail,
    fullName: fullName || authUser.user_metadata?.full_name || '',
    platformRole: normalizedPlatformRole,
    action: 'assigned_existing',
    inviteSent: false,
    existingUser: true,
  }
}

async function handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp) {
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'invite',
    email: normalizedEmail,
    options: { redirectTo },
  })

  if (linkError) throw linkError
  const actionLink = linkData?.properties?.action_link
  if (!actionLink) throw new Error('No se pudo regenerar el link de invitación')

  await sendInviteEmail({
    to: normalizedEmail,
    fullName,
    actionLink,
  })

  await upsertProfileRow(authUser.id, normalizedEmail, fullName, authUser, normalizedPlatformRole, timestamp)

  return {
    userId: authUser.id,
    email: normalizedEmail,
    fullName: fullName || authUser.user_metadata?.full_name || '',
    platformRole: normalizedPlatformRole,
    action: 'reinvited',
    inviteSent: true,
    existingUser: false,
  }
}

async function upsertProfileRow(userId, normalizedEmail, fullName, authUser, normalizedPlatformRole, timestamp) {
  // Never downgrade an existing admin profile. We use upsert with onConflict on id.
  const { error } = await supabaseAdmin
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: normalizedEmail,
        full_name: fullName || authUser?.user_metadata?.full_name || '',
        platform_role: normalizedPlatformRole,
        updated_at: timestamp,
      },
      { onConflict: 'id' }
    )

  if (error) throw error
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
    action: profile.action, // 'invited' | 'reinvited' | 'assigned_existing'
  }
}
