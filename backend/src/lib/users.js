import { supabaseAdmin } from './supabase.js'
import { normalizePlatformRole } from '../../../shared/userRoles.js'
import { sendInviteEmail } from './authEmails.js'
import { wrapSupabaseAuthCall } from './applicationErrors.js'
import { notifyManagerAssigned, shouldNotifyManagerAssigned } from './managerNotifications.js'

/**
 * Generates an invite action_link via Supabase Auth admin.generateLink,
 * then sends it via the provided email sender (defaults to Resend).
 *
 * Supports BOTH "fresh user" (no auth row yet — Supabase creates it) and
 * "reinvite existing user" flows. Pure-input/output for unit testing.
 *
 * @param {object} args
 * @param {object} [args.supabaseClient]  Supabase Admin client (defaults to supabaseAdmin)
 * @param {function} [args.emailSender]   Email sender function (defaults to sendInviteEmail)
 * @param {string} args.email             Target email (must be normalized)
 * @param {string} args.fullName          Full name for user_metadata + email greeting
 * @param {string} args.redirectTo        Absolute URL of the SetPassword frontend route
 * @param {object|null} args.req          Express req for wrapSupabaseAuthCall (or null)
 * @param {string} [args.operationName]   Tag for application_errors logging
 * @returns {Promise<{error: Error|null, actionLink: string|null, user: object|null, emailSent: boolean}>}
 *   Never throws — Supabase exceptions are caught and returned in the result's `error` field.
 */
export async function generateInviteLinkAndSendEmail({
  supabaseClient,
  emailSender,
  email,
  fullName,
  redirectTo,
  req = null,
  operationName = 'generateLink:invite',
}) {
  const client = supabaseClient || supabaseAdmin
  const sender = emailSender || sendInviteEmail

  let data, error
  try {
    const result = await wrapSupabaseAuthCall({
      operation: () => client.auth.admin.generateLink({
        type: 'invite',
        email,
        options: {
          redirectTo,
          data: { full_name: fullName || '' },
        },
      }),
      operationName,
      req,
      args: { email, type: 'invite' },
    })
    data = result.data
    error = result.error
  } catch (thrownError) {
    // wrapSupabaseAuthCall rethrows on caught operation() exceptions. We
    // catch here to preserve the helper's "never throws, returns errors in
    // result object" contract. The applicationErrorId (if set by the
    // wrapper) is preserved on the thrown error for trace correlation.
    return { error: thrownError, actionLink: null, user: null, emailSent: false }
  }

  if (error) {
    return { error, actionLink: null, user: null, emailSent: false }
  }

  const actionLink = data?.properties?.action_link
  const user = data?.user || null

  if (!actionLink) {
    return {
      error: new Error('No se pudo generar el link de invitación'),
      actionLink: null,
      user,
      emailSent: false,
    }
  }

  const emailResult = await sender({
    to: email,
    fullName,
    actionLink,
  })

  return {
    error: null,
    actionLink,
    user,
    emailSent: Boolean(emailResult?.sent),
  }
}

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
  // Uses generateLink+sendInviteEmail (Resend) — NOT supabaseAdmin.auth.admin.inviteUserByEmail,
  // because the native Supabase template lands users on the Site URL root, which redirects to /login.
  // generateLink with type='invite' creates the auth user when it doesn't exist AND returns a
  // properly-redirected action_link that lands on /auth/set-password.
  if (decision.action === 'invited') {
    const { error: inviteError, user: newAuthUser, emailSent } = await generateInviteLinkAndSendEmail({
      email: normalizedEmail,
      fullName,
      redirectTo,
      req,
      operationName: 'generateLink:invite:new',
    })

    if (inviteError || !newAuthUser?.id) {
      // Race: another invite landed between our lookups and now. Re-resolve once.
      const fallback = await findAuthUserByEmail(normalizedEmail)
      if (!fallback?.id) {
        throw inviteError || new Error('No se pudo crear el usuario')
      }
      // Treat as Case B (reinvite) on the retry path.
      return await handleReinvite(fallback, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req)
    }

    await upsertProfileRow(newAuthUser.id, normalizedEmail, fullName, newAuthUser, normalizedPlatformRole, timestamp)

    return {
      userId: newAuthUser.id,
      email: normalizedEmail,
      fullName: fullName || newAuthUser.user_metadata?.full_name || '',
      platformRole: normalizedPlatformRole,
      action: 'invited',
      inviteSent: Boolean(emailSent),
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

// Reinvite path for users that exist in auth.users but never activated.
// Unlike Case A (which has a race-fallback that demands inline error handling),
// this path has no fallback — any helper error propagates directly to the caller.
async function handleReinvite(authUser, normalizedEmail, fullName, normalizedPlatformRole, redirectTo, timestamp, req) {
  const { error, actionLink, emailSent } = await generateInviteLinkAndSendEmail({
    email: normalizedEmail,
    fullName,
    redirectTo,
    req,
    operationName: 'generateLink:invite:reinvite',
  })

  if (error) throw error
  if (!actionLink) throw new Error('No se pudo regenerar el link de invitación')

  await upsertProfileRow(authUser.id, normalizedEmail, fullName, authUser, normalizedPlatformRole, timestamp)

  return {
    userId: authUser.id,
    email: normalizedEmail,
    fullName: fullName || authUser.user_metadata?.full_name || '',
    platformRole: normalizedPlatformRole,
    action: 'reinvited',
    inviteSent: Boolean(emailSent),
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

  // Plan C: notify when an existing active user is promoted to manager.
  // notifyManagerAssigned is best-effort and never throws (failures log
  // to application_errors via Plan D). The membership row is already
  // committed; this only affects notification delivery.
  if (shouldNotifyManagerAssigned({ role, action: profile.action })) {
    await notifyManagerAssigned({
      targetUserId: profile.userId,
      companyId,
      actor: req?.currentUser || null,
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
