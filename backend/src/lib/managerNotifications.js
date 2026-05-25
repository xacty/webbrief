// Notification + email for "manager assigned to company" event.
// Spec §5.3 (Plan C). Fires only when an EXISTING active user is added as
// manager — fresh invites are already covered by the invite email path.

import { supabaseAdmin } from './supabase.js'
import { sendManagerAssignedEmail } from './authEmails.js'
import { logApplicationError } from './applicationErrors.js'

const DEFAULT_FRONTEND_URL = 'http://localhost:5173'

// PR3 QA: also notify for the new company-admin role. The original Plan C
// shipped before company-admin existed and only handled role='manager'.
const NOTIFIED_ROLES = new Set(['manager', 'admin'])

const ROLE_LABEL_ES = {
  manager: 'manager',
  admin: 'admin',
}

export function shouldNotifyManagerAssigned(input) {
  if (!input || typeof input !== 'object') return false
  return NOTIFIED_ROLES.has(input.role) && input.action === 'assigned_existing'
}

export function buildAddedByLabel(actor) {
  if (!actor) return ''
  return (actor.fullName?.trim() || actor.email?.trim() || '')
}

export function buildCompanyUrl({ companyId, frontendUrl }) {
  const base = (frontendUrl || DEFAULT_FRONTEND_URL).replace(/\/+$/, '')
  return `${base}/companies/${companyId}`
}

export function buildManagerNotificationRow({ targetUserId, companyId, companyName, actor, role = 'manager' }) {
  const addedByLabel = buildAddedByLabel(actor)
  const roleLabel = ROLE_LABEL_ES[role] || 'miembro'
  const body = addedByLabel
    ? `${addedByLabel} te agregó a ${companyName} como ${roleLabel}.`
    : `Te agregaron a ${companyName} como ${roleLabel}.`

  return {
    user_id: targetUserId,
    project_id: null,
    event_type: 'company_membership_added',
    title: `Te agregaron como ${roleLabel}`,
    body,
    metadata: {
      companyId,
      role,
      addedBy: actor?.id || null,
      companyName,
    },
  }
}

// Fires the notification + email. Best-effort: any failure logs to
// application_errors and returns silently. Never throws.
// PR3 QA: accepts `role` so we can render copy for either manager or
// company-admin assignments (defaults to manager for backward compat).
export async function notifyManagerAssigned({ targetUserId, companyId, actor, role = 'manager', req = null }) {
  try {
    if (!targetUserId || !companyId) return { skipped: true, reason: 'missing_ids' }

    // Load the target's email/full_name and the company's name in parallel.
    const [profileResult, companyResult] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, email, full_name')
        .eq('id', targetUserId)
        .maybeSingle(),
      supabaseAdmin
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .maybeSingle(),
    ])

    if (profileResult.error) throw profileResult.error
    if (companyResult.error) throw companyResult.error
    const profile = profileResult.data
    const company = companyResult.data
    if (!profile || !company) {
      return { skipped: true, reason: !profile ? 'profile_not_found' : 'company_not_found' }
    }

    // 1. Insert in-app notification (best-effort; isolate failure).
    let notificationInserted = false
    try {
      const row = buildManagerNotificationRow({
        targetUserId,
        companyId,
        companyName: company.name,
        actor,
        role,
      })
      const { error } = await supabaseAdmin.from('notifications').insert(row)
      if (error) throw error
      notificationInserted = true
    } catch (notifError) {
      await logApplicationError(req, notifError, {
        source: 'route',
        metadata: { operation: 'notifyManagerAssigned:insert', targetUserId, companyId },
      })
    }

    // 2. Send email (best-effort; isolate failure).
    let emailSent = false
    try {
      const companyUrl = buildCompanyUrl({
        companyId,
        frontendUrl: process.env.FRONTEND_URL,
      })
      const result = await sendManagerAssignedEmail({
        to: profile.email,
        fullName: profile.full_name,
        companyName: company.name,
        addedByLabel: buildAddedByLabel(actor),
        companyUrl,
        role,
      })
      emailSent = Boolean(result?.sent)
      if (!result?.sent && result?.reason && result.reason !== 'no_api_key' && result.reason !== 'missing_recipient') {
        await logApplicationError(req, new Error(`Manager-assigned email failed: ${result.reason}`), {
          source: 'email',
          metadata: { operation: 'sendManagerAssignedEmail', targetUserId, companyId, reason: result.reason },
        })
      }
    } catch (emailError) {
      await logApplicationError(req, emailError, {
        source: 'email',
        metadata: { operation: 'sendManagerAssignedEmail', targetUserId, companyId },
      })
    }

    return { notificationInserted, emailSent }
  } catch (error) {
    // Outer-catch: profile/company lookup failed. Log + swallow.
    await logApplicationError(req, error, {
      source: 'route',
      metadata: { operation: 'notifyManagerAssigned', targetUserId, companyId },
    }).catch(() => {})
    return { error: true }
  }
}
