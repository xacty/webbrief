import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { inviteUserToCompany, normalizeEmail } from '../lib/users.js'
import {
  canAccessCompany,
  canManageCompanyLifecycle,
  getAccessibleCompanyIds,
} from '../lib/projectAccess.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
let archiveColumnsAvailable = true

router.use(requireAuth)

function slugifyCompanyName(name) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'company'
}

function isMissingArchiveColumn(error) {
  const message = error?.message || ''
  return (
    error?.code === '42703' &&
    (
      message.includes('archived_at') ||
      message.includes('trashed_at') ||
      message.includes('delete_after')
    )
  )
}

async function runWithoutArchiveColumns(buildQuery) {
  if (!archiveColumnsAvailable) return buildQuery(false)
  const result = await buildQuery(true)
  if (!result.error || !isMissingArchiveColumn(result.error)) return result
  archiveColumnsAvailable = false
  return buildQuery(false)
}

async function fetchCompanyStats(companyIds) {
  const statsMap = new Map(companyIds.map((companyId) => [companyId, {
    projectCount: 0,
    memberCount: 0,
    lastActivity: null,
  }]))

  if (companyIds.length === 0) {
    return statsMap
  }

  const [
    { data: projects, error: projectsError },
    { data: memberships, error: membershipsError },
  ] = await Promise.all([
    runWithoutArchiveColumns((withArchiveColumns) => {
      let query = supabaseAdmin
        .from('projects')
        .select('company_id, updated_at')
        .in('company_id', companyIds)

      if (withArchiveColumns) {
        query = query.is('archived_at', null).is('trashed_at', null)
      }

      return query
    }),
    supabaseAdmin
      .from('company_memberships')
      .select('company_id')
      .in('company_id', companyIds),
  ])

  if (projectsError) throw projectsError
  if (membershipsError) throw membershipsError

  for (const project of projects || []) {
    const stats = statsMap.get(project.company_id)
    if (!stats) continue

    stats.projectCount += 1
    if (!stats.lastActivity || project.updated_at > stats.lastActivity) {
      stats.lastActivity = project.updated_at
    }
  }

  for (const membership of memberships || []) {
    const stats = statsMap.get(membership.company_id)
    if (!stats) continue
    stats.memberCount += 1
  }

  return statsMap
}

function serializeCompany(company, membershipMap, statsMap) {
  const stats = statsMap.get(company.id) || {
    projectCount: 0,
    memberCount: 0,
    lastActivity: null,
  }

  return {
    id: company.id,
    name: company.name,
    slug: company.slug,
    createdAt: company.created_at,
    updatedAt: company.updated_at,
    isTest: Boolean(company.is_test),
    archivedAt: company.archived_at,
    trashedAt: company.trashed_at,
    deleteAfter: company.delete_after,
    isInternal: company.slug === 'webrief',
    membershipRole: membershipMap.get(company.id) || null,
    projectCount: stats.projectCount,
    memberCount: stats.memberCount,
    lastActivity: stats.lastActivity,
  }
}

function normalizeProjectType(value) {
  return ['page', 'document', 'faq'].includes(value) ? value : 'page'
}

function inferProjectType(project, firstPageName = '') {
  const explicitType = project?.project_type
  if (explicitType === 'document' || explicitType === 'faq') return explicitType

  const normalizedFirstPageName = String(firstPageName || '').trim().toLowerCase()
  if (normalizedFirstPageName === 'documento') return 'document'
  if (
    normalizedFirstPageName === 'faq' ||
    normalizedFirstPageName === 'faqs' ||
    normalizedFirstPageName === 'preguntas frecuentes'
  ) {
    return 'faq'
  }

  return normalizeProjectType(explicitType)
}

router.get('/', async (req, res) => {
  try {
    const membershipMap = new Map(
      req.currentUser.memberships.map((membership) => [membership.companyId, membership.role])
    )

    const accessibleCompanyIds = getAccessibleCompanyIds(req.currentUser)
    if (accessibleCompanyIds && accessibleCompanyIds.length === 0) {
      return res.json({ companies: [] })
    }

    const { data: companies, error } = await runWithoutArchiveColumns((withArchiveColumns) => {
      const companyColumns = withArchiveColumns
        ? 'id, name, slug, is_test, archived_at, trashed_at, delete_after, created_at, updated_at'
        : 'id, name, slug, is_test, created_at, updated_at'
      let query = supabaseAdmin
        .from('companies')
        .select(companyColumns)
        .order('name', { ascending: true })

      if (withArchiveColumns) {
        query = query.is('archived_at', null).is('trashed_at', null)
      }

      if (accessibleCompanyIds) {
        query = query.in('id', accessibleCompanyIds)
      }

      return query
    })
    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const companyIds = (companies || []).map((company) => company.id)
    const statsMap = await fetchCompanyStats(companyIds)

    return res.json({
      companies: (companies || []).map((company) => serializeCompany(company, membershipMap, statsMap)),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar las empresas' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const companyId = req.params.id

    if (!canAccessCompany(req.currentUser, companyId)) {
      return res.status(404).json({ error: 'Empresa no encontrada' })
    }

    const [
      { data: company, error: companyError },
      { data: projects, error: projectsError },
      { data: memberships, error: membershipsError },
    ] = await Promise.all([
      runWithoutArchiveColumns((withArchiveColumns) => {
        const companyColumns = withArchiveColumns
          ? 'id, name, slug, is_test, archived_at, trashed_at, delete_after, created_at, updated_at'
          : 'id, name, slug, is_test, created_at, updated_at'
        let query = supabaseAdmin
          .from('companies')
          .select(companyColumns)
          .eq('id', companyId)

        if (withArchiveColumns) {
          query = query.is('archived_at', null).is('trashed_at', null)
        }

        return query.maybeSingle()
      }),
      runWithoutArchiveColumns((withArchiveColumns) => {
        let query = supabaseAdmin
          .from('projects')
          .select('*')
          .eq('company_id', companyId)
          .order('updated_at', { ascending: false })

        if (withArchiveColumns) {
          query = query.is('archived_at', null).is('trashed_at', null)
        }

        return query
      }),
      supabaseAdmin
        .from('company_memberships')
        .select('user_id, role, created_at')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false }),
    ])

    if (companyError) throw companyError
    if (projectsError) throw projectsError
    if (membershipsError) throw membershipsError
    if (!company) {
      return res.status(404).json({ error: 'Empresa no encontrada' })
    }

    const userIds = [...new Set((memberships || []).map((membership) => membership.user_id))]
    let profiles = []

    if (userIds.length > 0) {
      const { data: profileRows, error: profilesError } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', userIds)

      if (profilesError) throw profilesError
      profiles = profileRows || []
    }

    const profileMap = new Map(profiles.map((profile) => [profile.id, profile]))
    const membershipMap = new Map(
      req.currentUser.memberships.map((membership) => [membership.companyId, membership.role])
    )
    const statsMap = await fetchCompanyStats([companyId])
    const projectIdsNeedingInference = (projects || [])
      .filter((project) => !project.project_type)
      .map((project) => project.id)
    let firstPageNameByProjectId = new Map()

    if (projectIdsNeedingInference.length > 0) {
      const { data: firstPages, error: firstPagesError } = await supabaseAdmin
        .from('project_pages')
        .select('project_id, name, position')
        .in('project_id', projectIdsNeedingInference)
        .order('position', { ascending: true })

      if (firstPagesError) throw firstPagesError

      firstPageNameByProjectId = new Map()
      for (const page of firstPages || []) {
        if (!firstPageNameByProjectId.has(page.project_id)) {
          firstPageNameByProjectId.set(page.project_id, page.name || '')
        }
      }
    }

    return res.json({
      company: serializeCompany(company, membershipMap, statsMap),
      projects: (projects || []).map((project) => ({
        id: project.id,
        name: project.name,
        client: project.client_name,
        clientEmail: project.client_email,
        businessType: project.business_type,
        projectType: inferProjectType(project, firstPageNameByProjectId.get(project.id)),
        lastActivity: project.updated_at,
      })),
      members: (memberships || []).map((membership) => {
        const profile = profileMap.get(membership.user_id)
        return {
          userId: membership.user_id,
          fullName: profile?.full_name || '',
          email: profile?.email || '',
          role: membership.role,
          addedAt: membership.created_at,
        }
      }),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo cargar la empresa' })
  }
})

router.post('/', async (req, res) => {
  if (req.currentUser.platformRole !== 'admin') {
    return res.status(403).json({ error: 'Solo admin puede crear empresas' })
  }

  const { name, managerName, managerFullName, managerEmail, testMode = false } = req.body
  const createAsTest = req.currentUser.platformRole === 'admin' && Boolean(testMode)
  const timestamp = new Date().toISOString()
  const companyName = name?.trim() || (createAsTest ? `Empresa de prueba ${timestamp.slice(0, 16).replace('T', ' ')}` : '')

  if (!companyName) {
    return res.status(400).json({ error: 'name es requerido' })
  }

  const normalizedManagerEmail = normalizeEmail(managerEmail)
  if (!createAsTest && !normalizedManagerEmail) {
    return res.status(400).json({ error: 'managerEmail es requerido' })
  }

  try {
    const baseSlug = slugifyCompanyName(companyName)
    let slug = baseSlug
    let counter = 1

    while (true) {
      const { data: existing, error: existingError } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()

      if (existingError) {
        return res.status(500).json({ error: existingError.message })
      }

      if (!existing) break

      counter += 1
      slug = `${baseSlug}-${counter}`
    }

    const companyId = crypto.randomUUID()

    const { data: company, error } = await supabaseAdmin
      .from('companies')
      .insert({
        id: companyId,
        name: companyName,
        slug,
        is_test: createAsTest,
        created_for_testing_by: createAsTest ? req.currentUser.id : null,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select('id, name, slug, is_test, archived_at, trashed_at, delete_after, created_at, updated_at')
      .single()

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    let manager = null
    if (!createAsTest) {
      try {
        manager = await inviteUserToCompany({
          email: normalizedManagerEmail,
          fullName: managerFullName || managerName || '',
          role: 'manager',
          companyId: company.id,
        })
      } catch (managerError) {
        await supabaseAdmin
          .from('companies')
          .delete()
          .eq('id', company.id)

        return res.status(500).json({
          error: managerError.message || 'No se pudo crear el manager de la empresa',
        })
      }
    }

    const membershipMap = new Map()
    const statsMap = await fetchCompanyStats([company.id])

    return res.status(201).json({
      company: serializeCompany(company, membershipMap, statsMap),
      manager,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear la empresa' })
  }
})

router.post('/:id/archive', async (req, res) => {
  if (!canManageCompanyLifecycle(req.currentUser, req.params.id)) {
    return res.status(403).json({ error: 'Tu rol no puede archivar esta empresa' })
  }

  try {
    const { data: company, error: lookupError } = await supabaseAdmin
      .from('companies')
      .select('id, slug')
      .eq('id', req.params.id)
      .maybeSingle()

    if (lookupError) return res.status(500).json({ error: lookupError.message })
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' })
    if (company.slug === 'webrief') {
      return res.status(400).json({ error: 'La empresa interna WeBrief no se puede archivar' })
    }

    const archivedAt = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('companies')
      .update({ archived_at: archivedAt, archived_by: req.currentUser.id })
      .eq('id', company.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ archivedAt })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo archivar la empresa' })
  }
})

router.post('/:id/trash', async (req, res) => {
  if (!canManageCompanyLifecycle(req.currentUser, req.params.id)) {
    return res.status(403).json({ error: 'Tu rol no puede enviar esta empresa a papelera' })
  }

  try {
    const { data: company, error: lookupError } = await supabaseAdmin
      .from('companies')
      .select('id, slug')
      .eq('id', req.params.id)
      .maybeSingle()

    if (lookupError) return res.status(500).json({ error: lookupError.message })
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' })
    if (company.slug === 'webrief') {
      return res.status(400).json({ error: 'La empresa interna WeBrief no se puede enviar a papelera' })
    }

    const trashedAt = new Date()
    const deleteAfter = new Date(trashedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const { error } = await supabaseAdmin
      .from('companies')
      .update({
        trashed_at: trashedAt.toISOString(),
        delete_after: deleteAfter.toISOString(),
        deleted_by: req.currentUser.id,
      })
      .eq('id', company.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ trashedAt: trashedAt.toISOString(), deleteAfter: deleteAfter.toISOString() })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar la empresa a papelera' })
  }
})

router.post('/:id/restore', async (req, res) => {
  if (!canManageCompanyLifecycle(req.currentUser, req.params.id)) {
    return res.status(403).json({ error: 'Tu rol no puede restaurar esta empresa' })
  }

  try {
    const { error } = await supabaseAdmin
      .from('companies')
      .update({
        archived_at: null,
        archived_by: null,
        trashed_at: null,
        delete_after: null,
        deleted_by: null,
      })
      .eq('id', req.params.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ restored: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo restaurar la empresa' })
  }
})

router.delete('/:id/permanent', async (req, res) => {
  if (req.currentUser.platformRole !== 'admin') {
    return res.status(403).json({ error: 'Solo admin puede borrar empresas' })
  }

  try {
    const { data: company, error: lookupError } = await supabaseAdmin
      .from('companies')
      .select('id, slug')
      .eq('id', req.params.id)
      .maybeSingle()

    if (lookupError) return res.status(500).json({ error: lookupError.message })
    if (!company) return res.status(404).json({ error: 'Empresa no encontrada' })
    if (company.slug === 'webrief') {
      return res.status(400).json({ error: 'La empresa interna WeBrief no se puede borrar' })
    }

    const { error } = await supabaseAdmin
      .from('companies')
      .delete()
      .eq('id', company.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ deleted: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo borrar la empresa' })
  }
})

export default router
