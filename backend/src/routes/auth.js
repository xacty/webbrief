import { Router } from 'express'
import { inviteUserToCompany } from '../lib/users.js'
import { canInviteCompanyRole } from '../lib/projectAccess.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { normalizeEmail, normalizeText } from '../lib/validation.js'
import { normalizePlatformRole } from '../../../shared/userRoles.js'
import { toInviteSecurityAction } from '../../../shared/inviteActions.js'

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

  if (!canInviteCompanyRole(req.currentUser, targetCompanyId, role)) {
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
      message: invitedUser.inviteSent ? 'Invitacion enviada' : 'Usuario asignado',
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

export default router
