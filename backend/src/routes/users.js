import { Router } from 'express'
import crypto from 'node:crypto'
import multer from 'multer'
import { supabaseAdmin } from '../lib/supabase.js'
import {
  canInviteCompanyRole,
  canManageCompanyUsers,
  canRequestUserRemoval,
  getAccessibleCompanyIds,
} from '../lib/projectAccess.js'
import { ensureUserProfile, inviteUserToCompany, normalizeEmail } from '../lib/users.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
})
const COMPANY_ROLES = new Set(['manager', 'editor', 'content_writer', 'designer', 'developer'])
const PLATFORM_ROLES = new Set(['admin', 'user', 'qa'])
const USER_AVATARS_BUCKET = process.env.USER_AVATARS_BUCKET || 'user-avatars'
let sharpModulePromise = null

router.use(requireAuth)

async function getSharp() {
  sharpModulePromise ||= import('sharp').then((module) => module.default)
  return sharpModulePromise
}

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function isAdmin(currentUser) {
  return currentUser.platformRole === 'admin'
}

function getManagedCompanyIds(currentUser) {
  return currentUser.memberships
    .filter((membership) => membership.role === 'manager')
    .map((membership) => membership.companyId)
}

function canUseUsersPage(currentUser) {
  return isAdmin(currentUser) || currentUser.memberships.length > 0
}

function canAssignRole(currentUser, companyId, role) {
  if (!COMPANY_ROLES.has(role)) return false
  return canInviteCompanyRole(currentUser, companyId, role)
}

function canManageMembership(currentUser, companyId, targetRole) {
  if (!canManageCompanyUsers(currentUser, companyId)) return false
  return isAdmin(currentUser) || targetRole !== 'manager'
}

function normalizePlatformRole(currentUser, requestedRole) {
  if (!isAdmin(currentUser)) return 'user'
  return PLATFORM_ROLES.has(requestedRole) ? requestedRole : 'user'
}

async function getMembership(userId, companyId) {
  const { data, error } = await supabaseAdmin
    .from('company_memberships')
    .select('user_id, company_id, role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (error) throw error
  return data
}

async function assertCompanyKeepsManager(companyId, removedManagerId) {
  const { data, error } = await supabaseAdmin
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)
    .eq('role', 'manager')

  if (error) throw error

  const remainingManagers = (data || []).filter((membership) => membership.user_id !== removedManagerId)
  if (remainingManagers.length === 0) {
    throw httpError(400, 'La empresa debe conservar al menos un manager')
  }
}

async function userHasActiveMembership(userId) {
  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from('company_memberships')
    .select('company_id')
    .eq('user_id', userId)

  if (membershipsError) throw membershipsError

  const companyIds = [...new Set((memberships || []).map((membership) => membership.company_id))]
  if (companyIds.length === 0) return false

  const { data: activeCompanies, error: companiesError } = await supabaseAdmin
    .from('companies')
    .select('id')
    .in('id', companyIds)
    .is('archived_at', null)
    .is('trashed_at', null)
    .limit(1)

  if (companiesError) throw companiesError
  return (activeCompanies || []).length > 0
}

async function assertAdminCanChangeRole(userId) {
  const { data: admins, error } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('platform_role', 'admin')
    .neq('id', userId)
    .limit(1)

  if (error) throw error
  if ((admins || []).length === 0) {
    throw httpError(400, 'No se puede cambiar el rol del ultimo admin')
  }
}

async function loadUsersPayload(currentUser) {
  if (!canUseUsersPage(currentUser)) {
    throw httpError(403, 'No tienes acceso al directorio de usuarios')
  }

  const accessibleCompanyIds = getAccessibleCompanyIds(currentUser)

  let profiles = []
  let memberships = []
  let companies = []

  if (isAdmin(currentUser)) {
    const [
      { data: profileRows, error: profilesError },
      { data: membershipRows, error: membershipsError },
      { data: companyRows, error: companiesError },
    ] = await Promise.all([
      supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, avatar_url, platform_role, created_at, updated_at'),
      supabaseAdmin
        .from('company_memberships')
        .select('user_id, company_id, role, created_at, updated_at'),
      supabaseAdmin
        .from('companies')
        .select('id, name, slug')
        .is('archived_at', null)
        .is('trashed_at', null)
        .order('name', { ascending: true }),
    ])

    if (profilesError) throw profilesError
    if (membershipsError) throw membershipsError
    if (companiesError) throw companiesError

    profiles = profileRows || []
    memberships = membershipRows || []
    companies = companyRows || []
  } else {
    if (!accessibleCompanyIds || accessibleCompanyIds.length === 0) {
      return { users: [], companies: [] }
    }

    const [
      { data: companyRows, error: companiesError },
      { data: membershipRows, error: membershipsError },
    ] = await Promise.all([
      supabaseAdmin
        .from('companies')
        .select('id, name, slug')
        .in('id', accessibleCompanyIds)
        .is('archived_at', null)
        .is('trashed_at', null)
        .order('name', { ascending: true }),
      supabaseAdmin
        .from('company_memberships')
        .select('user_id, company_id, role, created_at, updated_at')
        .in('company_id', accessibleCompanyIds),
    ])

    if (companiesError) throw companiesError
    if (membershipsError) throw membershipsError

    companies = companyRows || []
    memberships = membershipRows || []

    const userIds = [...new Set(memberships.map((membership) => membership.user_id))]
    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name, avatar_url, platform_role, created_at, updated_at')
        .in('id', userIds)

      if (profilesError) throw profilesError
      profiles = profileRows || []
    }
  }

  const companyMap = new Map(
    companies.map((company) => [company.id, {
      id: company.id,
      name: company.name,
      slug: company.slug,
      isInternal: company.slug === 'webrief',
    }])
  )

  const membershipsByUser = new Map()

  for (const membership of memberships) {
    const currentMemberships = membershipsByUser.get(membership.user_id) || []
    const company = companyMap.get(membership.company_id)

    if (!company) continue

    currentMemberships.push({
      companyId: membership.company_id,
      companyName: company?.name || '',
      companySlug: company?.slug || '',
      isInternal: company?.isInternal || false,
      role: membership.role,
      addedAt: membership.created_at,
      updatedAt: membership.updated_at,
    })

    membershipsByUser.set(membership.user_id, currentMemberships)
  }

  const users = profiles
    .filter((profile) => {
      const userCompanies = membershipsByUser.get(profile.id) || []
      return (isAdmin(currentUser) && profile.platform_role !== 'user') || userCompanies.length > 0
    })
    .map((profile) => {
      const usesCompanyAccess = !isAdmin(currentUser) || profile.platform_role === 'user'
      const userCompanies = (usesCompanyAccess ? membershipsByUser.get(profile.id) || [] : [])
        .sort((a, b) => a.companyName.localeCompare(b.companyName))

      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name || '',
        avatarUrl: profile.avatar_url || '',
        platformRole: isAdmin(currentUser) ? profile.platform_role : 'user',
        createdAt: profile.created_at,
        updatedAt: profile.updated_at,
        companyCount: userCompanies.length,
        companies: userCompanies,
      }
    })
    .sort((a, b) => {
      const left = (a.fullName || a.email || '').toLowerCase()
      const right = (b.fullName || b.email || '').toLowerCase()
      return left.localeCompare(right)
    })

  return {
    users,
    companies: companies.map((company) => ({
      id: company.id,
      name: company.name,
      slug: company.slug,
      isInternal: company.slug === 'webrief',
    })),
  }
}

async function canAccessUser(currentUser, userId) {
  if (currentUser.id === userId) return true
  if (isAdmin(currentUser)) return true

  const accessibleCompanyIds = getAccessibleCompanyIds(currentUser)
  if (!accessibleCompanyIds || accessibleCompanyIds.length === 0) return false

  const { data: activeCompanies, error: activeCompaniesError } = await supabaseAdmin
    .from('companies')
    .select('id')
    .in('id', accessibleCompanyIds)
    .is('archived_at', null)
    .is('trashed_at', null)

  if (activeCompaniesError) throw activeCompaniesError

  const activeCompanyIds = (activeCompanies || []).map((company) => company.id)
  if (activeCompanyIds.length === 0) return false

  const { data, error } = await supabaseAdmin
    .from('company_memberships')
    .select('user_id')
    .eq('user_id', userId)
    .in('company_id', activeCompanyIds)
    .limit(1)

  if (error) throw error
  return (data || []).length > 0
}

async function canEditUserProfile(currentUser, userId) {
  if (currentUser.id === userId) return true
  if (isAdmin(currentUser)) return true

  const managedCompanyIds = getManagedCompanyIds(currentUser)
  if (managedCompanyIds.length === 0) return false

  const { data, error } = await supabaseAdmin
    .from('company_memberships')
    .select('user_id')
    .eq('user_id', userId)
    .in('company_id', managedCompanyIds)
    .limit(1)

  if (error) throw error
  return (data || []).length > 0
}

async function loadProfileBasic(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

router.get('/', async (req, res) => {
  try {
    return res.json(await loadUsersPayload(req.currentUser))
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudieron cargar los usuarios' })
  }
})

router.post('/', async (req, res) => {
  const { email, fullName, role, companyId, platformRole } = req.body

  try {
    const nextPlatformRole = normalizePlatformRole(req.currentUser, platformRole)

    if (!email) {
      return res.status(400).json({ error: 'email es requerido' })
    }

    if (nextPlatformRole !== 'user') {
      if (!isAdmin(req.currentUser)) {
        return res.status(403).json({ error: 'Solo admin puede crear roles globales' })
      }

      const profile = await ensureUserProfile({
        email,
        fullName,
        platformRole: nextPlatformRole,
      })

      return res.status(201).json({
        message: profile.inviteSent ? 'Invitacion enviada' : 'Usuario agregado',
        invitedUser: profile,
      })
    }

    if (!role || !companyId) {
      return res.status(400).json({ error: 'role y companyId son requeridos para usuarios de empresa' })
    }

    if (!canAssignRole(req.currentUser, companyId, role)) {
      return res.status(403).json({ error: 'No tienes permisos para invitar ese rol a esa empresa' })
    }

    const invitedUser = await inviteUserToCompany({
      email,
      fullName,
      role,
      companyId,
      platformRole: nextPlatformRole,
    })

    return res.status(201).json({
      message: invitedUser.inviteSent ? 'Invitacion enviada' : 'Acceso agregado',
      invitedUser,
    })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudo crear la invitacion' })
  }
})

router.patch('/:id', async (req, res) => {
  const userId = req.params.id
  const { fullName, email, platformRole } = req.body

  try {
    if (!await canEditUserProfile(req.currentUser, userId)) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    if (!isAdmin(req.currentUser) && (email !== undefined || platformRole !== undefined)) {
      return res.status(403).json({ error: 'Solo admin puede editar email o rol de plataforma' })
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name, platform_role')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) return res.status(404).json({ error: 'Usuario no encontrado' })

    const profileUpdates = {}
    const authUpdates = {}

    if (fullName !== undefined) {
      const nextFullName = String(fullName || '').trim()
      profileUpdates.full_name = nextFullName
      authUpdates.user_metadata = { full_name: nextFullName }
    }

    if (email !== undefined) {
      const nextEmail = normalizeEmail(email)
      if (!nextEmail) return res.status(400).json({ error: 'email es requerido' })

      profileUpdates.email = nextEmail
      authUpdates.email = nextEmail
    }

    if (platformRole !== undefined) {
      if (!PLATFORM_ROLES.has(platformRole)) {
        return res.status(400).json({ error: 'Rol de plataforma invalido' })
      }

      if (profile.platform_role === 'admin' && platformRole !== 'admin') {
        await assertAdminCanChangeRole(userId)
      }

      if (platformRole === 'user' && profile.platform_role !== 'user' && !await userHasActiveMembership(userId)) {
        return res.status(400).json({ error: 'Un usuario de empresa necesita al menos un acceso por empresa activo' })
      }

      profileUpdates.platform_role = platformRole
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authUpdates)
      if (authError) throw authError
    }

    if (Object.keys(profileUpdates).length > 0) {
      profileUpdates.updated_at = new Date().toISOString()
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update(profileUpdates)
        .eq('id', userId)

      if (updateError) throw updateError
    }

    return res.json({ updated: true })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar el usuario' })
  }
})

router.post('/:id/avatar', upload.single('avatar'), async (req, res) => {
  const userId = req.params.id

  try {
    if (!await canEditUserProfile(req.currentUser, userId)) {
      return res.status(404).json({ error: 'Usuario no encontrado' })
    }

    if (!req.file) {
      return res.status(400).json({ error: 'avatar es requerido' })
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(req.file.mimetype)) {
      return res.status(400).json({ error: 'Solo se aceptan JPEG, PNG o WebP' })
    }

    let sharp
    try {
      sharp = await getSharp()
    } catch (error) {
      console.error('Sharp is unavailable for avatar processing', error)
      return res.status(503).json({ error: 'El procesamiento de avatares no esta disponible en este servidor' })
    }

    const outputBuffer = await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 256, height: 256, fit: 'cover' })
      .webp({ quality: 84 })
      .toBuffer()

    const storagePath = `${userId}/${crypto.randomUUID()}.webp`
    const { error: uploadError } = await supabaseAdmin.storage
      .from(USER_AVATARS_BUCKET)
      .upload(storagePath, outputBuffer, {
        contentType: 'image/webp',
        upsert: false,
      })

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message })
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(USER_AVATARS_BUCKET)
      .getPublicUrl(storagePath)

    const avatarUrl = publicUrlData?.publicUrl || ''

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)

    if (profileError) throw profileError

    return res.json({ avatarUrl })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar la imagen del usuario' })
  }
})

router.patch('/:id/memberships/:companyId', async (req, res) => {
  const { id: userId, companyId } = req.params
  const { role } = req.body

  if (!role) {
    return res.status(400).json({ error: 'role es requerido' })
  }

  try {
    const membership = await getMembership(userId, companyId)
    if (!membership) return res.status(404).json({ error: 'Acceso no encontrado' })

    if (!canManageMembership(req.currentUser, companyId, membership.role)) {
      return res.status(403).json({ error: 'No tienes permisos para gestionar este acceso' })
    }

    if (!canAssignRole(req.currentUser, companyId, role)) {
      return res.status(403).json({ error: 'No tienes permisos para asignar ese rol' })
    }

    if (membership.role === 'manager' && role !== 'manager') {
      await assertCompanyKeepsManager(companyId, userId)
    }

    const { error } = await supabaseAdmin
      .from('company_memberships')
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', companyId)
      .eq('user_id', userId)

    if (error) throw error
    return res.json({ updated: true })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudo actualizar el acceso' })
  }
})

router.delete('/:id/memberships/:companyId', async (req, res) => {
  const { id: userId, companyId } = req.params

  try {
    const membership = await getMembership(userId, companyId)
    if (!membership) return res.status(404).json({ error: 'Acceso no encontrado' })

    if (!canManageMembership(req.currentUser, companyId, membership.role)) {
      return res.status(403).json({ error: 'No tienes permisos para gestionar este acceso' })
    }

    if (membership.role === 'manager') {
      await assertCompanyKeepsManager(companyId, userId)
    }

    const { error } = await supabaseAdmin
      .from('company_memberships')
      .delete()
      .eq('company_id', companyId)
      .eq('user_id', userId)

    if (error) throw error
    return res.json({ removed: true })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudo quitar el acceso' })
  }
})

router.post('/:id/removal-requests', async (req, res) => {
  const targetUserId = req.params.id
  const { companyId } = req.body || {}

  if (!companyId) {
    return res.status(400).json({ error: 'companyId es requerido' })
  }

  try {
    if (!canRequestUserRemoval(req.currentUser, companyId)) {
      return res.status(403).json({ error: 'Tu rol no puede solicitar esta eliminación' })
    }

    const [requesterMembership, targetMembership, targetProfile, companyResult] = await Promise.all([
      getMembership(req.currentUser.id, companyId),
      getMembership(targetUserId, companyId),
      loadProfileBasic(targetUserId),
      supabaseAdmin
        .from('companies')
        .select('id, name')
        .eq('id', companyId)
        .maybeSingle(),
    ])

    if (!requesterMembership || !targetMembership || !targetProfile || !companyResult.data) {
      return res.status(404).json({ error: 'No se encontró el usuario o la empresa para esta solicitud' })
    }

    const { data: managerMemberships, error: managersError } = await supabaseAdmin
      .from('company_memberships')
      .select('user_id')
      .eq('company_id', companyId)
      .eq('role', 'manager')

    if (managersError) throw managersError

    const recipients = (managerMemberships || [])
      .map((membership) => membership.user_id)
      .filter((userId) => userId && userId !== req.currentUser.id)

    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No hay managers disponibles para revisar esta solicitud' })
    }

    const timestamp = new Date().toISOString()
    const requesterLabel = req.currentUser.fullName || req.currentUser.email || 'Usuario'
    const targetLabel = targetProfile.full_name || targetProfile.email || 'Usuario'
    const companyName = companyResult.data.name
    const payload = recipients.map((userId) => ({
      user_id: userId,
      project_id: null,
      event_type: 'user_removal_requested',
      title: 'Solicitud de eliminación de usuario',
      body: `${requesterLabel} solicitó eliminar a ${targetLabel} de ${companyName}.`,
      metadata: {
        companyId,
        companyName,
        requesterUserId: req.currentUser.id,
        requesterLabel,
        targetUserId,
        targetUserLabel: targetLabel,
        targetRole: targetMembership.role,
        requestedAt: timestamp,
      },
    }))

    const { error: notificationsError } = await supabaseAdmin
      .from('notifications')
      .insert(payload)

    if (notificationsError) throw notificationsError

    return res.status(201).json({ requested: true })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudo crear la solicitud' })
  }
})

router.delete('/:id', async (req, res) => {
  if (!isAdmin(req.currentUser)) {
    return res.status(403).json({ error: 'Solo admin puede borrar cuentas' })
  }

  const userId = req.params.id

  if (userId === req.currentUser.id) {
    return res.status(400).json({ error: 'No puedes borrar tu propia cuenta' })
  }

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('id, platform_role')
      .eq('id', userId)
      .maybeSingle()

    if (profileError) throw profileError
    if (!profile) return res.status(404).json({ error: 'Usuario no encontrado' })

    if (profile.platform_role === 'admin') {
      const { data: admins, error: adminsError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('platform_role', 'admin')

      if (adminsError) throw adminsError
      if ((admins || []).length <= 1) {
        return res.status(400).json({ error: 'No se puede borrar el ultimo admin' })
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
    if (error) throw error

    return res.json({ deleted: true })
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message || 'No se pudo borrar el usuario' })
  }
})

export default router
