import { supabaseAdmin } from './supabase.js'
import { normalizePlatformRole } from '../../../shared/userRoles.js'
import { sendInviteEmail } from './authEmails.js'
import { wrapSupabaseAuthCall } from './applicationErrors.js'
import { notifyManagerAssigned, shouldNotifyManagerAssigned } from './managerNotifications.js'

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
    return { action: 'invited', userId: null }
  }
  if (!authUser.last_sign_in_at) {
    return { action: 'reinvited', userId: authUser.id }
  }
  return { action: 'assigned_existing', userId: authUser.id }
}

export async function ensureUserProfile({ email, fullName, platformRole = 'user', req = null }) {
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
  if (decision.action === 'invited') {
    const { data, error: inviteError } = await wrapSupabaseAuthCall({
      operation: () => supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, {
        redirectTo,
        data: { full_name: fullName || '' },
      }),
      operationName: 'inviteUserByEmail',
      req,
      args: { email: normalizedEmail },
    })

    if (inviteError || !data?.user?.id) {
      // Race: another invite landed between our lookups and now. Re-resolve once.
      const fallback = await findAuthUserByEmail(normalizedEmail)
      if (!fallback?.id) {
        throw inviteError || new Error('No se pudo crear el usuario')
      }
      // Treat as Case B (reinvite) on the retry path.
      return await handleReinvite(fallback, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req)
    }

    await upsertProfileRow(data.user.id, normalizedEmail, fullName, data.user, normalizedPlatformRole, timestamp)

    return {
      userId: data.user.id,
      email: normalizedEmail,
      fullName: fullName || data.user.user_metadata?.full_name || '',
      platformRole: normalizedPlatformRole,
      action: 'invited',
      inviteSent: true,
    }
  }

  // -------- Case B: reinvite (auth user exists, never activated) --------
  if (decision.action === 'reinvited') {
    return await handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req)
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
  }
}

async function handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req) {
  const { data: linkData, error: linkError } = await wrapSupabaseAuthCall({
    operation: () => supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: { redirectTo },
    }),
    operationName: 'generateLink:invite',
    req,
    args: { email: normalizedEmail, type: 'invite' },
  })

  if (linkError) throw linkError
  const actionLink = linkData?.properties?.action_link
  if (!actionLink) throw new Error('No se pudo regenerar el link de invitación')

  const emailResult = await sendInviteEmail({
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
    inviteSent: Boolean(emailResult?.sent),
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

export async function inviteUserToCompany({ email, fullName, companyId, role, platformRole = 'user', req = null }) {
  const profile = await ensureUserProfile({ email, fullName, platformRole, req })
  await assignUserToCompany({ companyId, userId: profile.userId, role })

  // Plan C: notify when an existing active user is promoted to a high-rank
  // role (manager or company-admin). notifyManagerAssigned is best-effort
  // and never throws (failures log to application_errors via Plan D). The
  // membership row is already committed; this only affects notification
  // delivery. PR3 QA extended this to include the new admin role.
  if (shouldNotifyManagerAssigned({ role, action: profile.action })) {
    await notifyManagerAssigned({
      targetUserId: profile.userId,
      companyId,
      actor: req?.currentUser || null,
      role,
      req,
    })
  }

  return {
    id: profile.userId,
    email: profile.email,
    fullName: profile.fullName,
    role,
    companyId,
    inviteSent: profile.inviteSent,
    action: profile.action, // 'invited' | 'reinvited' | 'assigned_existing'
  }
}
