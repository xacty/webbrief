import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

function getCompanyIdsForCompanyLifecycle(currentUser) {
  if (currentUser.platformRole === 'admin') return null
  return currentUser.memberships
    .filter((membership) => membership.role === 'manager')
    .map((membership) => membership.companyId)
}

function getCompanyIdsForProjectLifecycle(currentUser) {
  if (currentUser.platformRole === 'admin') return null
  return currentUser.memberships
    .filter((membership) => ['manager', 'editor'].includes(membership.role))
    .map((membership) => membership.companyId)
}

function lifecycleState(row) {
  return row.trashed_at ? 'trashed' : 'archived'
}

function normalizeLifecycleState(value) {
  return value === 'archived' ? 'archived' : 'trashed'
}

function applyLifecycleFilter(query, state) {
  if (state === 'archived') {
    return query
      .not('archived_at', 'is', null)
      .is('trashed_at', null)
  }

  return query.not('trashed_at', 'is', null)
}

function serializeCompany(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    state: lifecycleState(row),
    archivedAt: row.archived_at,
    trashedAt: row.trashed_at,
    deleteAfter: row.delete_after,
    updatedAt: row.updated_at,
  }
}

function serializeProject(row) {
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.company?.name || row.companies?.name || '',
    name: row.name,
    client: row.client_name,
    businessType: row.business_type,
    projectType: row.project_type || 'page',
    state: lifecycleState(row),
    archivedAt: row.archived_at,
    trashedAt: row.trashed_at,
    deleteAfter: row.delete_after,
    updatedAt: row.updated_at,
  }
}

router.get('/', async (req, res) => {
  try {
    const requestedState = normalizeLifecycleState(req.query.state)
    const companyLifecycleIds = getCompanyIdsForCompanyLifecycle(req.currentUser)
    const projectLifecycleIds = getCompanyIdsForProjectLifecycle(req.currentUser)
    const canSeeCompanies = companyLifecycleIds === null || companyLifecycleIds.length > 0
    const canSeeProjects = projectLifecycleIds === null || projectLifecycleIds.length > 0

    const companiesPromise = canSeeCompanies
      ? (() => {
          let query = supabaseAdmin
            .from('companies')
            .select('id, name, slug, archived_at, trashed_at, delete_after, updated_at')
            .order('updated_at', { ascending: false })

          query = applyLifecycleFilter(query, requestedState)

          if (companyLifecycleIds) {
            query = query.in('id', companyLifecycleIds)
          }

          return query
        })()
      : Promise.resolve({ data: [], error: null })

    const projectsPromise = canSeeProjects
      ? (() => {
          let query = supabaseAdmin
            .from('projects')
            .select('*, company:companies(name)')
            .order('updated_at', { ascending: false })

          query = applyLifecycleFilter(query, requestedState)

          if (projectLifecycleIds) {
            query = query.in('company_id', projectLifecycleIds)
          }

          return query
        })()
      : Promise.resolve({ data: [], error: null })

    const [
      { data: companies, error: companiesError },
      { data: projects, error: projectsError },
    ] = await Promise.all([companiesPromise, projectsPromise])

    if (companiesError) return res.status(500).json({ error: companiesError.message })
    if (projectsError) return res.status(500).json({ error: projectsError.message })

    return res.json({
      state: requestedState,
      companies: (companies || []).map(serializeCompany),
      projects: (projects || []).map(serializeProject),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo cargar la papelera' })
  }
})

export default router
