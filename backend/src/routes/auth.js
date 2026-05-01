import { Router } from 'express'
import { inviteUserToCompany } from '../lib/users.js'
import { canInviteCompanyRole } from '../lib/projectAccess.js'
import { requireAuth } from '../middleware/auth.js'
import { normalizePlatformRole } from '../../../shared/userRoles.js'

const router = Router()

function getAllowedPlatformRole(currentUser, requestedRole) {
  if (currentUser.platformRole !== 'admin') return 'user'
  return normalizePlatformRole(requestedRole)
}

router.get('/me', requireAuth, async (req, res) => {
  return res.json({ user: req.currentUser })
})

router.post('/invite-user', requireAuth, async (req, res) => {
  const { email, fullName, role, companyId, platformRole } = req.body

  if (!email || !role) {
    return res.status(400).json({ error: 'email y role son requeridos' })
  }

  const targetCompanyId = companyId || req.currentUser.memberships[0]?.companyId
  if (!targetCompanyId) {
    return res.status(400).json({ error: 'No hay una empresa valida para la invitacion' })
  }

  if (!canInviteCompanyRole(req.currentUser, targetCompanyId, role)) {
    return res.status(403).json({ error: 'No tienes permisos para invitar ese rol a esa empresa' })
  }

  try {
    const invitedUser = await inviteUserToCompany({
      email,
      fullName,
      role,
      companyId: targetCompanyId,
      platformRole: getAllowedPlatformRole(req.currentUser, platformRole),
    })

    return res.status(201).json({
      message: invitedUser.inviteSent ? 'Invitacion enviada' : 'Usuario asignado',
      invitedUser,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear la invitacion' })
  }
})

export default router
