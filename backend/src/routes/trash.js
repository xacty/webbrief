import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

function getManageableCompanyIds(currentUser) {
  if (currentUser.platformRole === 'admin') return null
  return currentUser.memberships
    .filter((membership) => membership.role === 'manager')
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
    const manageableCompanyIds = getManageableCompanyIds(req.currentUser)
    const canSeeProjects = manageableCompanyIds === null || manageableCompanyIds.length > 0

    const companiesPromise = req.currentUser.platformRole === 'admin'
      ? applyLifecycleFilter(
          supabaseAdmin
            .from('companies')
            .select('id, name, slug, archived_at, trashed_at, delete_after, updated_at')
            .order('updated_at', { ascending: false }),
          requestedState
        )
      : Promise.resolve({ data: [], error: null })

    const projectsPromise = canSeeProjects
      ? (() => {
          let query = supabaseAdmin
            .from('projects')
            .select('id, company_id, name, client_name, business_type, archived_at, trashed_at, delete_after, updated_at, company:companies(name)')
            .order('updated_at', { ascending: false })

          query = applyLifecycleFilter(query, requestedState)

          if (manageableCompanyIds) {
            query = query.in('company_id', manageableCompanyIds)
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
