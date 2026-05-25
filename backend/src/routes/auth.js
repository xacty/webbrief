import { Router } from 'express'
import { inviteUserToCompany } from '../lib/users.js'
import { canManageCompanyUsers } from '../lib/projectAccess.js'
import { canAssignRoleRanked } from '../lib/membershipPermissions.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { normalizeEmail, normalizeText } from '../lib/validation.js'
import { normalizePlatformRole, COMPANY_ROLE_SET } from '../../../shared/userRoles.js'
import { toInviteSecurityAction, buildInviteResultMessage } from '../../../shared/inviteActions.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { validateResetRequestRow } from '../lib/sendAccess.js'

const router = Router()

function getAllowedPlatformRole(currentUser, requestedRole) {
  if (currentUser.platformRole !== 'admin') return 'user'
  return normalizePlatformRole(requestedRole)
}

router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.currentUser })
})

router.post('/invite-user', requireAuth, rateLimiters.inviteUser, async (req, res) => {
  const { email, fullName, role, companyId, platformRole } = req.body
  const normalizedEmail = normalizeEmail(email)
  const normalizedFullName = normalizeText(fullName, 120)

  if (!normalizedEmail || !role) {
    return res.status(400).json({ error: 'Datos de invitación inválidos' })
  }

  const targetCompanyId = companyId || req.currentUser.memberships[0]?.companyId
  if (!targetCompanyId) {
    return res.status(400).json({ error: 'No hay una empresa valida para la invitacion' })
  }

  // PR3 QA fix: align this endpoint with the rank-aware permission model used by
  // /api/users routes. The legacy canInviteCompanyRole helper does not know about
  // the company-admin role (would silently reject company-admins inviting anyone
  // and would refuse role='admin' for everyone). Use the same gate as POST /api/users.
  if (!COMPANY_ROLE_SET.has(role)) {
    return res.status(400).json({ error: 'Rol invalido' })
  }
  if (!canManageCompanyUsers(req.currentUser, targetCompanyId)) {
    return res.status(403).json({ error: 'No tienes permisos para invitar a esta empresa' })
  }
  if (!canAssignRoleRanked({
    actorPlatformRole: req.currentUser?.platformRole,
    actorMemberships: req.currentUser?.memberships || [],
    companyId: targetCompanyId,
    role,
  })) {
    return res.status(403).json({ error: 'No tienes permisos para invitar ese rol a esa empresa' })
  }

  try {
    const allowedPlatformRole = getAllowedPlatformRole(req.currentUser, platformRole)
    const invitedUser = await inviteUserToCompany({
      email: normalizedEmail,
      fullName: normalizedFullName,
      role,
      companyId: targetCompanyId,
      platformRole: allowedPlatformRole,
      req,
    })

    await logSecurityEvent(req, {
      action: toInviteSecurityAction(invitedUser.action),
      resourceType: 'user',
      resourceId: invitedUser.id,
      companyId: targetCompanyId,
      targetUserId: invitedUser.id,
      metadata: {
        role,
        platformRole: allowedPlatformRole,
        inviteSent: invitedUser.inviteSent,
        decisionAction: invitedUser.action,
        via: 'manual_invite',
      },
    })

    return res.status(201).json({
      message: buildInviteResultMessage({
        action: invitedUser.action,
        inviteSent: invitedUser.inviteSent,
      }),
      invitedUser,
    })
  } catch (error) {
    console.error('invite-user failed', {
      actorId: req.currentUser.id,
      companyId: targetCompanyId,
      error: error.message,
    })
    return res.status(500).json({ error: 'No se pudo crear la invitación' })
  }
})

router.post('/validate-reset-token', requireAuth, rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const userId = req.currentUser?.id
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const { data: row, error } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id, expires_at, used_at')
      .eq('user_id', userId)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error

    const result = validateResetRequestRow({ row, now: new Date() })
    return res.status(200).json(result)
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo validar el token' })
  }
})

router.post('/track-invite-accepted', requireAuth, rateLimiters.trackEvent, async (req, res) => {
  try {
    const userId = req.currentUser?.id
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    const rawVia = String(req.body?.via || '').toLowerCase()
    const via = rawVia === 'recovery' ? 'recovery' : rawVia === 'invite' ? 'invite' : null
    if (!via) {
      return res.status(400).json({ error: "Body 'via' debe ser 'invite' o 'recovery'" })
    }

    const action = via === 'invite' ? 'invite_accepted' : 'password_reset_completed'
    await logSecurityEvent(req, {
      action,
      resourceType: 'user',
      resourceId: userId,
      targetUserId: userId,
      metadata: { via },
    })

    return res.status(200).json({ tracked: true, action })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo registrar el evento' })
  }
})

router.post('/mark-reset-used', requireAuth, rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const userId = req.currentUser?.id
    if (!userId) {
      return res.status(401).json({ error: 'No autenticado' })
    }

    // Find the most recent active row.
    const { data: row, error: findError } = await supabaseAdmin
      .from('password_reset_requests')
      .select('id')
      .eq('user_id', userId)
      .is('used_at', null)
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (findError) throw findError
    if (!row) {
      // Idempotent: nothing to mark. Not an error from the client's perspective.
      return res.status(200).json({ marked: false, reason: 'no_active_row' })
    }

    const { error: updateError } = await supabaseAdmin
      .from('password_reset_requests')
      .update({ used_at: new Date().toISOString() })
      .eq('id', row.id)

    if (updateError) throw updateError

    return res.status(200).json({ marked: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo marcar el token usado' })
  }
})

export default router
