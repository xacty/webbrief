import { Router } from 'express'
import multer from 'multer'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { seedProjectPages } from '../data/projectTemplates.js'
import {
  canAccessCompany,
  canEditBrief,
  canManageProject,
  createShareToken,
  getAccessibleCompanyIds,
  getProjectById,
  hashToken,
  isMissingTableError,
  logProjectActivity,
  recordSectionEditActivities,
  serializeActivity,
} from '../lib/projectAccess.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
})
const ASSETS_BUCKET = process.env.PROJECT_ASSETS_BUCKET || 'project-assets'
let archiveColumnsAvailable = true
let projectPageVersionColumnAvailable = true
let projectPageContentJsonColumnAvailable = true
let projectPageReviewColumnsAvailable = true
let projectPageVersionsTableAvailable = true
let projectActivityTableAvailable = true
let projectActivityRetryAt = 0
let sharpModulePromise = null

router.use(requireAuth)

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

function updateMissingProjectPageColumn(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`
  const isMissingColumn = error?.code === '42703'
    || error?.code === 'PGRST204'
    || message.includes('does not exist')
    || message.includes('schema cache')

  if (!isMissingColumn) return false

  if (message.includes('version')) {
    projectPageVersionColumnAvailable = false
    return true
  }

  if (message.includes('content_json')) {
    projectPageContentJsonColumnAvailable = false
    return true
  }

  if (
    message.includes('review_status') ||
    message.includes('review_baseline_version_id') ||
    message.includes('review_baseline_at') ||
    message.includes('review_requested_by')
  ) {
    projectPageReviewColumnsAvailable = false
    return true
  }

  return false
}

async function runWithoutArchiveColumns(buildQuery) {
  if (!archiveColumnsAvailable) return buildQuery(false)
  const result = await buildQuery(true)
  if (!result.error || !isMissingArchiveColumn(result.error)) return result
  archiveColumnsAvailable = false
  return buildQuery(false)
}

async function runWithProjectPageOptionalColumns(buildQuery) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await buildQuery({
      version: projectPageVersionColumnAvailable,
      contentJson: projectPageContentJsonColumnAvailable,
      review: projectPageReviewColumnsAvailable,
    })

    if (!result.error || !updateMissingProjectPageColumn(result.error)) return result
  }

  return buildQuery({
    version: projectPageVersionColumnAvailable,
    contentJson: projectPageContentJsonColumnAvailable,
    review: projectPageReviewColumnsAvailable,
  })
}

function extractSectionsSnapshot(html = '') {
  const sections = []
  const dividerRe = /<div[^>]*data-section-divider[^>]*data-section-id="([^"]*)"[^>]*data-section-name="([^"]*)"[^>]*><\/div>/g
  let match
  while ((match = dividerRe.exec(html)) !== null) {
    sections.push({
      id: match[1],
      name: match[2],
    })
  }
  return sections
}

async function createPageVersion({ project, page, currentUser, source = 'review_baseline', versionName = 'Enviado a revisión' }) {
  if (!projectPageVersionsTableAvailable) return null

  const payload = {
    project_id: project.id,
    page_id: page.id,
    version_name: versionName,
    source,
    content_html: page.content_html || '<p></p>',
    content_json: page.content_json || null,
    sections_snapshot: extractSectionsSnapshot(page.content_html || '<p></p>'),
    created_by: currentUser.id,
  }

  const { data, error } = await supabaseAdmin
    .from('project_page_versions')
    .insert(payload)
    .select('id, project_id, page_id, version_name, source, created_at')
    .single()

  if (error) {
    if (isMissingTableError(error, 'project_page_versions')) {
      projectPageVersionsTableAvailable = false
      return null
    }
    throw error
  }

  return data
}

function coerceUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '')
    ? value
    : crypto.randomUUID()
}

async function getSharp() {
  sharpModulePromise ||= import('sharp').then((module) => module.default)
  return sharpModulePromise
}

function normalizeProjectList(projects, companyMap) {
  return projects.map((project) => ({
    id: project.id,
    name: project.name,
    client: project.client_name,
    clientEmail: project.client_email,
    companyId: project.company_id,
    companyName:
      project.company?.name
      || project.companies?.name
      || companyMap.get(project.company_id)
      || '',
    businessType: project.business_type,
    lastActivity: project.updated_at,
    hasChanges: false,
  }))
}

async function fetchCompanyMap(companyIds) {
  if (!companyIds.length) return new Map()

  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('id, name')
    .in('id', companyIds)

  if (error) throw error
  return new Map((data || []).map((company) => [company.id, company.name]))
}

router.get('/', async (req, res) => {
  try {
    const requestedCompanyId = req.query.companyId
    const accessibleCompanyIds = getAccessibleCompanyIds(req.currentUser)
    if (accessibleCompanyIds && accessibleCompanyIds.length === 0) {
      return res.json({ projects: [] })
    }

    if (requestedCompanyId && !canAccessCompany(req.currentUser, requestedCompanyId)) {
      return res.status(403).json({ error: 'No tienes acceso a esa empresa' })
    }

    const { data: projects, error } = await runWithoutArchiveColumns((withArchiveColumns) => {
      let query = supabaseAdmin
        .from('projects')
        .select('id, name, client_name, client_email, company_id, business_type, updated_at, company:companies(name)')
        .order('updated_at', { ascending: false })

      if (withArchiveColumns) {
        query = query.is('archived_at', null).is('trashed_at', null)
      }

      if (requestedCompanyId) {
        query = query.eq('company_id', requestedCompanyId)
      } else if (accessibleCompanyIds) {
        query = query.in('company_id', accessibleCompanyIds)
      }

      return query
    })
    if (error) {
      return res.status(500).json({ error: error.message })
    }

    const needsCompanyFallback = (projects || []).some((project) => !project.company?.name && !project.companies?.name)
    const companyIds = needsCompanyFallback
      ? [...new Set((projects || []).map((project) => project.company_id))]
      : []
    const companyMap = await fetchCompanyMap(companyIds)

    return res.json({ projects: normalizeProjectList(projects || [], companyMap) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar los proyectos' })
  }
})

router.post('/', async (req, res) => {
  const { name, clientName, clientEmail, businessType, companyId } = req.body

  if (!name || !clientName || !businessType) {
    return res.status(400).json({ error: 'name, clientName y businessType son requeridos' })
  }

  const fallbackCompanyId = req.currentUser.memberships[0]?.companyId || null
  const targetCompanyId = companyId || fallbackCompanyId

  if (!targetCompanyId) {
    return res.status(400).json({ error: 'No hay una empresa disponible para crear el proyecto' })
  }

  if (!canAccessCompany(req.currentUser, targetCompanyId)) {
    return res.status(403).json({ error: 'No tienes acceso a esa empresa' })
  }
  if (!canEditBrief(req.currentUser, targetCompanyId)) {
    return res.status(403).json({ error: 'Tu rol no puede crear proyectos en esta empresa' })
  }

  try {
    const projectId = crypto.randomUUID()
    const pages = seedProjectPages(businessType)
    const timestamp = new Date().toISOString()

    const { data: project, error: projectError } = await supabaseAdmin
      .from('projects')
      .insert({
        id: projectId,
        company_id: targetCompanyId,
        name: name.trim(),
        client_name: clientName.trim(),
        client_email: clientEmail?.trim() || null,
        business_type: businessType,
        created_by: req.currentUser.id,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select('*')
      .single()

    if (projectError) {
      return res.status(500).json({ error: projectError.message })
    }

    const pagePayload = pages.map((page) => {
      const payloadPage = {
        ...page,
        project_id: projectId,
        created_at: timestamp,
        updated_at: timestamp,
      }

      if (!projectPageContentJsonColumnAvailable) {
        delete payloadPage.content_json
      }

      return payloadPage
    })

    let { error: pagesError } = await supabaseAdmin
      .from('project_pages')
      .insert(pagePayload)

    if (pagesError && updateMissingProjectPageColumn(pagesError)) {
      const fallbackPayload = pagePayload.map((page) => {
        const nextPage = { ...page }
        if (!projectPageContentJsonColumnAvailable) delete nextPage.content_json
        return nextPage
      })
      const fallbackResult = await supabaseAdmin
        .from('project_pages')
        .insert(fallbackPayload)
      pagesError = fallbackResult.error
    }

    if (pagesError) {
      return res.status(500).json({ error: pagesError.message })
    }

    await logProjectActivity({
      projectId,
      currentUser: req.currentUser,
      eventType: 'project_created',
      subjectType: 'project',
      subjectId: projectId,
      title: 'Proyecto creado',
      description: project.name,
    })

    return res.status(201).json({ project })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear el proyecto' })
  }
})

router.get('/:id', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }

    const { data: pages, error } = await runWithProjectPageOptionalColumns((columns) => {
      const pageColumns = [
        'id',
        'name',
        'position',
        'content_html',
        columns.contentJson ? 'content_json' : null,
        columns.version ? 'version' : null,
        columns.review ? 'review_status' : null,
        columns.review ? 'review_baseline_version_id' : null,
        columns.review ? 'review_baseline_at' : null,
        columns.review ? 'review_requested_by' : null,
        'updated_at',
      ].filter(Boolean).join(', ')

      return supabaseAdmin
        .from('project_pages')
        .select(pageColumns)
        .eq('project_id', project.id)
        .order('position', { ascending: true })
    })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.json({
      project: {
        id: project.id,
        name: project.name,
        clientName: project.client_name,
        clientEmail: project.client_email,
        businessType: project.business_type,
        companyId: project.company_id,
        archivedAt: project.archived_at,
        trashedAt: project.trashed_at,
        updatedAt: project.updated_at,
      },
      pages: (pages || []).map((page) => ({
        id: page.id,
        name: page.name,
        position: page.position,
        contentHtml: page.content_html,
        contentJson: page.content_json || null,
        version: page.version || 1,
        reviewStatus: page.review_status || 'draft',
        reviewBaselineVersionId: page.review_baseline_version_id || null,
        reviewBaselineAt: page.review_baseline_at || null,
        reviewRequestedBy: page.review_requested_by || null,
        updatedAt: page.updated_at,
      })),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo cargar el proyecto' })
  }
})

router.put('/:id/pages', async (req, res) => {
  const { pages, source = 'manual', sectionEvents = [] } = req.body

  if (!Array.isArray(pages) || pages.length === 0) {
    return res.status(400).json({ error: 'pages debe ser un array no vacio' })
  }

  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }
    if (!canEditBrief(req.currentUser, project.company_id)) {
      return res.status(403).json({ error: 'Tu rol no puede editar el brief' })
    }

    const timestamp = new Date().toISOString()
    const { data: existingPages, error: existingError } = await runWithProjectPageOptionalColumns((columns) => {
      const pageColumns = columns.version ? 'id, version' : 'id'

      return supabaseAdmin
        .from('project_pages')
        .select(pageColumns)
        .eq('project_id', project.id)
    })

    if (existingError) {
      return res.status(500).json({ error: existingError.message })
    }

    const existingVersionMap = projectPageVersionColumnAvailable
      ? new Map((existingPages || []).map((page) => [page.id, page.version || 1]))
      : new Map()
    const stalePage = projectPageVersionColumnAvailable
      ? pages.find((page) => {
          const pageId = coerceUuid(page.id)
          const serverVersion = existingVersionMap.get(pageId)
          return serverVersion && page.version && Number(page.version) !== Number(serverVersion)
        })
      : null

    if (stalePage) {
      return res.status(409).json({
        error: 'El brief cambió en otra sesión. Recarga el proyecto antes de guardar.',
        pageId: stalePage.id,
      })
    }

    const payload = pages.map((page, index) => {
      const pageId = coerceUuid(page.id)
      const currentVersion = existingVersionMap.get(pageId) || 0

      const payloadPage = {
        id: pageId,
        project_id: project.id,
        name: page.name?.trim() || `Pagina ${index + 1}`,
        position: index,
        content_html: page.contentHtml || '<p></p>',
        updated_at: timestamp,
      }

      if (projectPageContentJsonColumnAvailable) {
        payloadPage.content_json = page.contentJson || null
      }

      if (projectPageVersionColumnAvailable) {
        payloadPage.version = currentVersion + 1
      }

      if (projectPageReviewColumnsAvailable) {
        payloadPage.review_status = page.reviewStatus || 'draft'
        payloadPage.review_baseline_version_id = page.reviewBaselineVersionId || null
        payloadPage.review_baseline_at = page.reviewBaselineAt || null
        payloadPage.review_requested_by = page.reviewRequestedBy || null
      }

      return payloadPage
    })

    const keepIds = new Set(payload.map((page) => page.id))
    const deleteIds = (existingPages || [])
      .map((page) => page.id)
      .filter((pageId) => !keepIds.has(pageId))

    let { error: upsertError } = await supabaseAdmin
      .from('project_pages')
      .upsert(payload, { onConflict: 'id' })

    if (upsertError && updateMissingProjectPageColumn(upsertError)) {
      const fallbackPayload = payload.map((page) => {
        const nextPage = { ...page }
        if (!projectPageContentJsonColumnAvailable) delete nextPage.content_json
        if (!projectPageVersionColumnAvailable) delete nextPage.version
        if (!projectPageReviewColumnsAvailable) {
          delete nextPage.review_status
          delete nextPage.review_baseline_version_id
          delete nextPage.review_baseline_at
          delete nextPage.review_requested_by
        }
        return nextPage
      })

      const fallbackResult = await supabaseAdmin
        .from('project_pages')
        .upsert(fallbackPayload, { onConflict: 'id' })
      upsertError = fallbackResult.error
    }

    if (upsertError) {
      return res.status(500).json({ error: upsertError.message })
    }

    if (deleteIds.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from('project_pages')
        .delete()
        .eq('project_id', project.id)
        .in('id', deleteIds)

      if (deleteError) {
        return res.status(500).json({ error: deleteError.message })
      }
    }

    const { error: projectUpdateError } = await supabaseAdmin
      .from('projects')
      .update({ updated_at: timestamp })
      .eq('id', project.id)

    if (projectUpdateError) {
      return res.status(500).json({ error: projectUpdateError.message })
    }

    const reviewReadyPageIds = new Set(payload
      .filter((page) => ['ready_for_review', 'approved', 'changes_requested'].includes(page.review_status))
      .map((page) => page.id))
    const reviewSectionEvents = sectionEvents.filter((event) => reviewReadyPageIds.has(event.pageId))

    if (reviewSectionEvents.length > 0) {
      await recordSectionEditActivities({
        projectId: project.id,
        currentUser: req.currentUser,
        sectionEvents: reviewSectionEvents,
      })
    }

    return res.json({
      pages: payload.map((page) => ({
        id: page.id,
        name: page.name,
        position: page.position,
        contentHtml: page.content_html,
        contentJson: page.content_json || null,
        version: page.version || 1,
        reviewStatus: page.review_status || 'draft',
        reviewBaselineVersionId: page.review_baseline_version_id || null,
        reviewBaselineAt: page.review_baseline_at || null,
        reviewRequestedBy: page.review_requested_by || null,
      })),
      savedAt: timestamp,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo guardar el proyecto' })
  }
})

router.post('/:id/pages/:pageId/review', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }
    if (!canEditBrief(req.currentUser, project.company_id)) {
      return res.status(403).json({ error: 'Tu rol no puede enviar esta página a revisión' })
    }

    const pageColumns = [
      'id',
      'project_id',
      'name',
      'position',
      'content_html',
      projectPageContentJsonColumnAvailable ? 'content_json' : null,
      projectPageVersionColumnAvailable ? 'version' : null,
      projectPageReviewColumnsAvailable ? 'review_status' : null,
      projectPageReviewColumnsAvailable ? 'review_baseline_version_id' : null,
      projectPageReviewColumnsAvailable ? 'review_baseline_at' : null,
      projectPageReviewColumnsAvailable ? 'review_requested_by' : null,
      'updated_at',
    ].filter(Boolean).join(', ')

    let { data: page, error: pageError } = await supabaseAdmin
      .from('project_pages')
      .select(pageColumns)
      .eq('id', req.params.pageId)
      .eq('project_id', project.id)
      .maybeSingle()

    if (pageError) {
      if (updateMissingProjectPageColumn(pageError)) {
        return res.status(500).json({ error: 'Faltan columnas de revisión en project_pages. Ejecuta la migración de Supabase.' })
      }
      return res.status(500).json({ error: pageError.message })
    }

    if (!page) return res.status(404).json({ error: 'Página no encontrada' })
    if (!projectPageReviewColumnsAvailable) {
      return res.status(500).json({ error: 'Faltan columnas de revisión en project_pages. Ejecuta la migración de Supabase.' })
    }

    const pageVersion = await createPageVersion({
      project,
      page,
      currentUser: req.currentUser,
      source: 'review_baseline',
      versionName: req.body.versionName?.trim() || `Revisión: ${page.name}`,
    })

    if (!pageVersion) {
      return res.status(500).json({ error: 'Falta la tabla project_page_versions. Ejecuta la migración de Supabase.' })
    }

    const timestamp = new Date().toISOString()
    const { data, error } = await supabaseAdmin
      .from('project_pages')
      .update({
        review_status: 'ready_for_review',
        review_baseline_version_id: pageVersion.id,
        review_baseline_at: timestamp,
        review_requested_by: req.currentUser.id,
      })
      .eq('id', page.id)
      .select('id, name, position, content_html, content_json, version, review_status, review_baseline_version_id, review_baseline_at, review_requested_by, updated_at')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'page_ready_for_review',
      subjectType: 'page',
      subjectId: page.id,
      title: 'Página enviada a revisión',
      description: data.name,
      metadata: {
        pageId: data.id,
        pageName: data.name,
        versionId: pageVersion.id,
      },
    })

    return res.json({
      page: {
        id: data.id,
        name: data.name,
        position: data.position,
        contentHtml: data.content_html,
        contentJson: data.content_json || null,
        version: data.version || 1,
        reviewStatus: data.review_status || 'draft',
        reviewBaselineVersionId: data.review_baseline_version_id || null,
        reviewBaselineAt: data.review_baseline_at || null,
        reviewRequestedBy: data.review_requested_by || null,
        updatedAt: data.updated_at,
      },
      pageVersion,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar la página a revisión' })
  }
})

router.get('/:id/activity', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }

    if (!projectActivityTableAvailable) {
      if (Date.now() < projectActivityRetryAt) {
        return res.json({ activity: [], activityAvailable: false })
      }
      projectActivityTableAvailable = true
    }

    const { data, error } = await supabaseAdmin
      .from('project_activity')
      .select('id, project_id, actor_label, event_type, subject_type, subject_id, title, description, metadata, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      if (isMissingTableError(error, 'project_activity')) {
        projectActivityTableAvailable = false
        projectActivityRetryAt = Date.now() + 30_000
        return res.json({ activity: [], activityAvailable: false })
      }

      return res.status(500).json({ error: error.message })
    }

    return res.json({ activity: (data || []).map(serializeActivity), activityAvailable: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo cargar la actividad' })
  }
})

router.patch('/:id/activity/:activityId/read', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }

    if (!projectActivityTableAvailable) {
      return res.status(404).json({ error: 'Actividad no encontrada' })
    }

    const { data: activity, error: readError } = await supabaseAdmin
      .from('project_activity')
      .select('id, project_id, actor_label, event_type, subject_type, subject_id, title, description, metadata, created_at')
      .eq('id', req.params.activityId)
      .eq('project_id', project.id)
      .maybeSingle()

    if (readError) {
      if (isMissingTableError(readError, 'project_activity')) {
        projectActivityTableAvailable = false
        return res.status(404).json({ error: 'Actividad no encontrada' })
      }

      return res.status(500).json({ error: readError.message })
    }

    if (!activity) {
      return res.status(404).json({ error: 'Actividad no encontrada' })
    }

    const metadata = {
      ...(activity.metadata || {}),
      readAt: new Date().toISOString(),
      readBy: req.currentUser.id,
      readByLabel: req.currentUser.fullName || req.currentUser.email || 'Usuario',
    }

    const { data, error } = await supabaseAdmin
      .from('project_activity')
      .update({ metadata })
      .eq('id', activity.id)
      .select('id, project_id, actor_label, event_type, subject_type, subject_id, title, description, metadata, created_at')
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ activity: serializeActivity(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo marcar la actividad' })
  }
})

router.get('/:id/deliverables', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }

    const { data, error } = await supabaseAdmin
      .from('project_deliverables')
      .select('id, project_id, title, service_type, status, assignee_id, linked_page_id, linked_section_id, created_at, updated_at')
      .eq('project_id', project.id)
      .is('trashed_at', null)
      .order('updated_at', { ascending: false })

    if (error) return res.status(500).json({ error: error.message })
    return res.json({
      deliverables: (data || []).map((item) => ({
        id: item.id,
        projectId: item.project_id,
        title: item.title,
        serviceType: item.service_type,
        status: item.status,
        assigneeId: item.assignee_id,
        linkedPageId: item.linked_page_id,
        linkedSectionId: item.linked_section_id,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar los entregables' })
  }
})

router.post('/:id/deliverables', async (req, res) => {
  const { title, serviceType = 'otro', assigneeId = null, linkedPageId = null, linkedSectionId = null } = req.body
  if (!title?.trim()) {
    return res.status(400).json({ error: 'title es requerido' })
  }

  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }

    const { data, error } = await supabaseAdmin
      .from('project_deliverables')
      .insert({
        project_id: project.id,
        title: title.trim(),
        service_type: serviceType,
        status: 'todo',
        assignee_id: assigneeId,
        linked_page_id: linkedPageId,
        linked_section_id: linkedSectionId,
        created_by: req.currentUser.id,
        updated_by: req.currentUser.id,
      })
      .select('id, project_id, title, service_type, status, assignee_id, linked_page_id, linked_section_id, created_at, updated_at')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'deliverable_created',
      subjectType: 'deliverable',
      subjectId: data.id,
      title: 'Entregable creado',
      description: data.title,
    })

    return res.status(201).json({
      deliverable: {
        id: data.id,
        projectId: data.project_id,
        title: data.title,
        serviceType: data.service_type,
        status: data.status,
        assigneeId: data.assignee_id,
        linkedPageId: data.linked_page_id,
        linkedSectionId: data.linked_section_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear el entregable' })
  }
})

router.patch('/:id/deliverables/:deliverableId', async (req, res) => {
  const allowedStatuses = new Set(['todo', 'in_progress', 'review', 'approved', 'blocked'])
  const updates = {}

  if (req.body.title !== undefined) updates.title = String(req.body.title || '').trim()
  if (req.body.serviceType !== undefined) updates.service_type = req.body.serviceType
  if (req.body.status !== undefined && allowedStatuses.has(req.body.status)) updates.status = req.body.status
  if (req.body.assigneeId !== undefined) updates.assignee_id = req.body.assigneeId || null
  if (req.body.linkedPageId !== undefined) updates.linked_page_id = req.body.linkedPageId || null
  if (req.body.linkedSectionId !== undefined) updates.linked_section_id = req.body.linkedSectionId || null

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No hay cambios válidos' })
  }

  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }

    updates.updated_by = req.currentUser.id

    const { data, error } = await supabaseAdmin
      .from('project_deliverables')
      .update(updates)
      .eq('id', req.params.deliverableId)
      .eq('project_id', project.id)
      .select('id, project_id, title, service_type, status, assignee_id, linked_page_id, linked_section_id, created_at, updated_at')
      .maybeSingle()

    if (error) return res.status(500).json({ error: error.message })
    if (!data) return res.status(404).json({ error: 'Entregable no encontrado' })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'deliverable_updated',
      subjectType: 'deliverable',
      subjectId: data.id,
      title: 'Entregable actualizado',
      description: data.title,
      metadata: { status: data.status },
    })

    return res.json({
      deliverable: {
        id: data.id,
        projectId: data.project_id,
        title: data.title,
        serviceType: data.service_type,
        status: data.status,
        assigneeId: data.assignee_id,
        linkedPageId: data.linked_page_id,
        linkedSectionId: data.linked_section_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo actualizar el entregable' })
  }
})

router.post('/:id/share-links', async (req, res) => {
  const { label = 'Link privado', expiresAt = null } = req.body

  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }
    if (!canEditBrief(req.currentUser, project.company_id)) {
      return res.status(403).json({ error: 'Tu rol no puede compartir este proyecto' })
    }

    const token = createShareToken()
    const { data, error } = await supabaseAdmin
      .from('project_share_links')
      .insert({
        project_id: project.id,
        token_hash: hashToken(token),
        label,
        expires_at: expiresAt,
        created_by: req.currentUser.id,
      })
      .select('id, project_id, label, expires_at, revoked_at, created_at')
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'share_link_created',
      subjectType: 'share_link',
      subjectId: data.id,
      title: 'Link privado creado',
      description: data.label,
    })

    return res.status(201).json({
      shareLink: {
        id: data.id,
        projectId: data.project_id,
        label: data.label,
        token,
        url: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/share/${token}`,
        expiresAt: data.expires_at,
        revokedAt: data.revoked_at,
        createdAt: data.created_at,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear el link privado' })
  }
})

router.post('/:id/assets', upload.single('file'), async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) {
      return res.status(404).json({ error: 'Proyecto no encontrado' })
    }
    if (!req.file) {
      return res.status(400).json({ error: 'file es requerido' })
    }

    const originalMime = req.file.mimetype
    const originalName = req.file.originalname || 'asset'
    const isSvg = originalMime === 'image/svg+xml' || originalName.toLowerCase().endsWith('.svg')
    const isRaster = ['image/jpeg', 'image/png', 'image/webp'].includes(originalMime)

    if (!isSvg && !isRaster) {
      return res.status(400).json({ error: 'Solo se aceptan JPEG, PNG, WebP o SVG' })
    }

    let outputBuffer = req.file.buffer
    let mimeType = originalMime
    let extension = isSvg ? 'svg' : 'webp'
    let width = null
    let height = null

    if (isRaster) {
      let sharp
      try {
        sharp = await getSharp()
      } catch (error) {
        console.error('Sharp is unavailable for raster asset processing', error)
        return res.status(503).json({ error: 'El procesamiento de imagenes raster no esta disponible en este servidor' })
      }

      const image = sharp(req.file.buffer).rotate()
      const metadata = await image.metadata()
      width = metadata.width || null
      height = metadata.height || null
      outputBuffer = await image
        .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
      mimeType = 'image/webp'
    }

    const assetId = crypto.randomUUID()
    const storagePath = `${project.company_id}/${project.id}/${assetId}.${extension}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .upload(storagePath, outputBuffer, {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      return res.status(500).json({ error: uploadError.message })
    }

    const { data: publicUrlData } = supabaseAdmin.storage
      .from(ASSETS_BUCKET)
      .getPublicUrl(storagePath)

    const { data: asset, error: assetError } = await supabaseAdmin
      .from('project_assets')
      .insert({
        id: assetId,
        project_id: project.id,
        deliverable_id: req.body.deliverableId || null,
        page_id: req.body.pageId || null,
        section_id: req.body.sectionId || null,
        uploaded_by: req.currentUser.id,
        file_name: originalName,
        storage_bucket: ASSETS_BUCKET,
        storage_path: storagePath,
        mime_type: mimeType,
        asset_kind: isSvg ? 'svg' : 'image',
        public_url: isSvg ? null : publicUrlData?.publicUrl || null,
        file_size: outputBuffer.byteLength,
        width,
        height,
        render_inline: !isSvg,
      })
      .select('id, project_id, file_name, storage_bucket, storage_path, mime_type, asset_kind, public_url, file_size, width, height, render_inline, created_at')
      .single()

    if (assetError) return res.status(500).json({ error: assetError.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'asset_uploaded',
      subjectType: 'asset',
      subjectId: asset.id,
      title: isSvg ? 'SVG adjuntado' : 'Imagen subida',
      description: asset.file_name,
      metadata: { mimeType: asset.mime_type, renderInline: asset.render_inline },
    })

    return res.status(201).json({
      asset: {
        id: asset.id,
        projectId: asset.project_id,
        fileName: asset.file_name,
        bucket: asset.storage_bucket,
        path: asset.storage_path,
        mimeType: asset.mime_type,
        assetKind: asset.asset_kind,
        publicUrl: asset.public_url,
        fileSize: asset.file_size,
        width: asset.width,
        height: asset.height,
        renderInline: asset.render_inline,
        createdAt: asset.created_at,
      },
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo subir el archivo' })
  }
})

router.post('/:id/archive', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!canManageProject(req.currentUser, project.company_id)) {
      return res.status(403).json({ error: 'Tu rol no puede archivar este proyecto' })
    }

    const timestamp = new Date().toISOString()
    const { error } = await supabaseAdmin
      .from('projects')
      .update({ archived_at: timestamp, archived_by: req.currentUser.id })
      .eq('id', project.id)

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'project_archived',
      subjectType: 'project',
      subjectId: project.id,
      title: 'Proyecto archivado',
    })

    return res.json({ archivedAt: timestamp })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo archivar el proyecto' })
  }
})

router.post('/:id/trash', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser)
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!canManageProject(req.currentUser, project.company_id)) {
      return res.status(403).json({ error: 'Tu rol no puede enviar este proyecto a papelera' })
    }

    const trashedAt = new Date()
    const deleteAfter = new Date(trashedAt.getTime() + 30 * 24 * 60 * 60 * 1000)
    const { error } = await supabaseAdmin
      .from('projects')
      .update({
        trashed_at: trashedAt.toISOString(),
        delete_after: deleteAfter.toISOString(),
        deleted_by: req.currentUser.id,
      })
      .eq('id', project.id)

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'project_trashed',
      subjectType: 'project',
      subjectId: project.id,
      title: 'Proyecto enviado a papelera',
      description: 'Retención de 30 días',
    })

    return res.json({ trashedAt: trashedAt.toISOString(), deleteAfter: deleteAfter.toISOString() })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo enviar el proyecto a papelera' })
  }
})

router.post('/:id/restore', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser, { includeTrashed: true })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!canManageProject(req.currentUser, project.company_id)) {
      return res.status(403).json({ error: 'Tu rol no puede restaurar este proyecto' })
    }

    const { error } = await supabaseAdmin
      .from('projects')
      .update({
        archived_at: null,
        archived_by: null,
        trashed_at: null,
        delete_after: null,
        deleted_by: null,
      })
      .eq('id', project.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ restored: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo restaurar el proyecto' })
  }
})

router.delete('/:id/permanent', async (req, res) => {
  try {
    const project = await getProjectById(req.params.id, req.currentUser, { includeTrashed: true })
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado' })
    if (!canManageProject(req.currentUser, project.company_id)) {
      return res.status(403).json({ error: 'Tu rol no puede borrar permanentemente este proyecto' })
    }

    const { error } = await supabaseAdmin
      .from('projects')
      .delete()
      .eq('id', project.id)

    if (error) return res.status(500).json({ error: error.message })
    return res.json({ deleted: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo borrar permanentemente el proyecto' })
  }
})

export default router
