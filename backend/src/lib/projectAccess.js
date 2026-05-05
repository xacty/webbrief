import { createHash, randomBytes } from 'node:crypto'
import { supabaseAdmin } from './supabase.js'

let projectArchiveColumnsAvailable = true
let projectActivityTableAvailable = true
let notificationsTableAvailable = true
let projectActivityRetryAt = 0
let notificationsRetryAt = 0

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

export function isMissingTableError(error, tableName) {
  const message = `${error?.message || ''} ${error?.details || ''}`
  const mentionsTable = message.includes(`public.${tableName}`)
    || message.includes(`'${tableName}'`)
    || message.includes(`"${tableName}"`)

  return (
    error?.code === '42P01'
    || error?.code === 'PGRST205'
    || (mentionsTable && (
      message.includes('schema cache')
      || message.includes('does not exist')
      || message.includes('Could not find')
    ))
  )
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function createShareToken() {
  return randomBytes(32).toString('base64url')
}

export function getAccessibleCompanyIds(currentUser) {
  if (currentUser.platformRole === 'admin') return null
  return currentUser.memberships.map((membership) => membership.companyId)
}

export function getCompanyMembership(currentUser, companyId) {
  return currentUser.memberships.find((membership) => membership.companyId === companyId) || null
}

export function getCompanyRole(currentUser, companyId) {
  return getCompanyMembership(currentUser, companyId)?.role || null
}

export function canAccessCompany(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return Boolean(getCompanyMembership(currentUser, companyId))
}

export function canManageCompanyLifecycle(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return getCompanyRole(currentUser, companyId) === 'manager'
}

export function canManageCompanyUsers(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return getCompanyRole(currentUser, companyId) === 'manager'
}

export function canCreateProject(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return ['manager', 'editor'].includes(getCompanyRole(currentUser, companyId))
}

export function canManageProjectMeta(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return ['manager', 'editor'].includes(getCompanyRole(currentUser, companyId))
}

export function canManageProjectLifecycle(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return ['manager', 'editor'].includes(getCompanyRole(currentUser, companyId))
}

export function canManageProjectStructure(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return ['manager', 'editor', 'content_writer', 'developer'].includes(getCompanyRole(currentUser, companyId))
}

export function canWriteProjectContent(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return ['manager', 'editor', 'content_writer', 'designer', 'developer'].includes(getCompanyRole(currentUser, companyId))
}

export function canUseProjectHandoff(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return ['manager', 'designer', 'developer'].includes(getCompanyRole(currentUser, companyId))
}

export function canSendProjectReview(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return true
  return ['manager', 'designer', 'developer'].includes(getCompanyRole(currentUser, companyId))
}

export function canInviteCompanyRole(currentUser, companyId, role) {
  const allowedRoles = ['manager', 'editor', 'content_writer', 'designer', 'developer']
  if (!allowedRoles.includes(role)) return false

  if (currentUser.platformRole === 'admin') return true

  const membershipRole = getCompanyRole(currentUser, companyId)

  if (membershipRole === 'manager') {
    return ['editor', 'content_writer', 'designer', 'developer'].includes(role)
  }

  if (membershipRole === 'editor') {
    return ['content_writer', 'designer', 'developer'].includes(role)
  }

  if (['designer', 'developer'].includes(membershipRole)) {
    return ['editor', 'designer', 'developer'].includes(role)
  }

  return false
}

export function canRequestUserRemoval(currentUser, companyId) {
  if (currentUser.platformRole === 'admin') return false
  return ['editor', 'designer', 'developer'].includes(getCompanyRole(currentUser, companyId))
}

export const canEditBrief = canManageProjectMeta
export const canManageProject = canManageProjectLifecycle

export function actorLabel(currentUser) {
  return currentUser.fullName || currentUser.email || 'Usuario'
}

function sectionChangeLabel(changeType) {
  const labels = {
    text_changed: 'Cambió texto',
    title_changed: 'Cambió título',
    cta_added: 'Agregó CTA',
    cta_removed: 'Eliminó CTA',
    cta_changed: 'Cambió CTA',
    image_added: 'Agregó imagen',
    image_changed: 'Cambió imagen',
    image_removed: 'Eliminó imagen',
    table_changed: 'Cambió tabla',
    section_moved: 'Movió la sección',
    section_added: 'Agregó sección',
    section_removed: 'Eliminó sección',
    section_renamed: 'Renombró sección',
    content_changed: 'Editó contenido',
  }

  return labels[changeType] || 'Editó contenido'
}

function normalizeSectionActivityEvent(event) {
  if (!event?.pageId || !event?.sectionId) return null

  const changeTypes = Array.isArray(event.changeTypes)
    ? [...new Set(event.changeTypes.filter(Boolean).map(String))].slice(0, 6)
    : []

  if (changeTypes.length === 0) return null

  // Cap snapshot to ~30 KB to avoid blowing up the metadata column.
  // Each history entry stores htmlAfter; with cap of 50 entries per row,
  // worst case ~1.5 MB per section row. Acceptable for jsonb in Supabase.
  const MAX_SNAPSHOT_BYTES = 30_000
  const rawHtml = typeof event.sectionHtml === 'string' ? event.sectionHtml : ''
  const sectionHtml = rawHtml.length > MAX_SNAPSHOT_BYTES
    ? rawHtml.slice(0, MAX_SNAPSHOT_BYTES)
    : rawHtml

  return {
    pageId: String(event.pageId),
    pageName: String(event.pageName || 'Página'),
    sectionId: String(event.sectionId),
    sectionName: String(event.sectionName || 'Sección'),
    changeTypes,
    previousIndex: Number.isFinite(Number(event.previousIndex)) ? Number(event.previousIndex) : null,
    nextIndex: Number.isFinite(Number(event.nextIndex)) ? Number(event.nextIndex) : null,
    sectionHtml,
  }
}

export async function getProjectById(projectId, currentUser, options = {}) {
  const { includeTrashed = false } = options

  async function fetchProject(withArchiveColumns) {
    let query = supabaseAdmin
      .from('projects')
      .select('*')
      .eq('id', projectId)

    if (!includeTrashed && withArchiveColumns) {
      query = query.is('archived_at', null).is('trashed_at', null)
    }

    return query.maybeSingle()
  }

  let result = await fetchProject(projectArchiveColumnsAvailable)
  if (result.error && isMissingArchiveColumn(result.error)) {
    projectArchiveColumnsAvailable = false
    result = await fetchProject(false)
  }

  const { data, error } = result

  if (error) throw error
  if (!data) return null
  if (!canAccessCompany(currentUser, data.company_id)) return null
  return data
}

export async function logProjectActivity({
  projectId,
  currentUser = null,
  eventType,
  subjectType = null,
  subjectId = null,
  title,
  description = null,
  metadata = {},
}) {
  if (!projectActivityTableAvailable) {
    if (Date.now() < projectActivityRetryAt) return null
    projectActivityTableAvailable = true
  }

  const { data, error } = await supabaseAdmin
    .from('project_activity')
    .insert({
      project_id: projectId,
      actor_user_id: currentUser?.id || null,
      actor_label: currentUser ? actorLabel(currentUser) : metadata.clientName || 'Cliente',
      event_type: eventType,
      subject_type: subjectType,
      subject_id: subjectId,
      title,
      description,
      metadata,
    })
    .select('id, project_id, actor_label, event_type, subject_type, subject_id, title, description, metadata, created_at')
    .single()

  if (error) {
    if (isMissingTableError(error, 'project_activity')) {
      projectActivityTableAvailable = false
      projectActivityRetryAt = Date.now() + 30_000
      return null
    }

    throw error
  }

  return data
}

export async function recordSectionEditActivities({ projectId, currentUser, sectionEvents = [] }) {
  if (!projectActivityTableAvailable) {
    if (Date.now() < projectActivityRetryAt) return []
    projectActivityTableAvailable = true
  }

  if (!Array.isArray(sectionEvents) || sectionEvents.length === 0) {
    return []
  }

  const events = sectionEvents
    .map(normalizeSectionActivityEvent)
    .filter(Boolean)

  if (events.length === 0) return []

  const timestamp = new Date().toISOString()
  const actor = actorLabel(currentUser)
  const recorded = []

  try {
    const { data: existingActivities, error: existingError } = await supabaseAdmin
      .from('project_activity')
      .select('id, metadata, created_at')
      .eq('project_id', projectId)
      .eq('actor_user_id', currentUser?.id)
      .eq('event_type', 'section_edited')
      .order('created_at', { ascending: false })
      .limit(100)

    if (existingError) {
      if (isMissingTableError(existingError, 'project_activity')) {
        projectActivityTableAvailable = false
        projectActivityRetryAt = Date.now() + 30_000
        return []
      }
      throw existingError
    }

    for (const event of events) {
      const changeLabels = event.changeTypes.map(sectionChangeLabel)
      const title = event.changeTypes.includes('section_moved') && event.changeTypes.length === 1
        ? `Se movió ${event.sectionName}`
        : `Se editó ${event.sectionName}`
      const description = changeLabels.join(' · ')
      const match = (existingActivities || []).find((activity) => {
        const metadata = activity.metadata || {}
        return metadata.pageId === event.pageId
          && metadata.sectionId === event.sectionId
          && !metadata.readAt
      })

      // Append the current edit to a per-row history so "Ver detalle" can show every change with timestamp + actor.
      const previousHistory = Array.isArray(match?.metadata?.history) ? match.metadata.history : []
      const historyEntry = {
        changeTypes: event.changeTypes,
        actorId: currentUser?.id || null,
        actorLabel: actor,
        at: timestamp,
        // htmlAfter: snapshot of the section's HTML right after this save.
        // The previous entry's htmlAfter is "htmlBefore" for diff purposes.
        // Empty string means snapshot was unavailable (e.g. section_removed).
        htmlAfter: event.sectionHtml || '',
      }
      // Cap history to the most recent 50 entries.
      const nextHistory = [historyEntry, ...previousHistory].slice(0, 50)

      const metadata = {
        ...(match?.metadata || {}),
        pageId: event.pageId,
        pageName: event.pageName,
        sectionId: event.sectionId,
        sectionName: event.sectionName,
        changeTypes: event.changeTypes,
        previousIndex: event.previousIndex,
        nextIndex: event.nextIndex,
        source: 'autosave',
        history: nextHistory,
      }
      delete metadata.readAt
      delete metadata.readBy
      delete metadata.readByLabel

      if (match) {
        const { data, error } = await supabaseAdmin
          .from('project_activity')
          .update({
            title,
            description,
            metadata,
            created_at: timestamp,
          })
          .eq('id', match.id)
          .select('id, project_id, actor_label, event_type, subject_type, subject_id, title, description, metadata, created_at')
          .single()

        if (error) throw error
        recorded.push(data)
        continue
      }

      const { data, error } = await supabaseAdmin
        .from('project_activity')
        .insert({
          project_id: projectId,
          actor_user_id: currentUser?.id || null,
          actor_label: actor,
          event_type: 'section_edited',
          subject_type: 'section',
          subject_id: null,
          title,
          description,
          metadata,
          created_at: timestamp,
        })
        .select('id, project_id, actor_label, event_type, subject_type, subject_id, title, description, metadata, created_at')
        .single()

      if (error) throw error
      recorded.push(data)
    }
  } catch (error) {
    if (isMissingTableError(error, 'project_activity')) {
      projectActivityTableAvailable = false
      projectActivityRetryAt = Date.now() + 30_000
      return []
    }

    throw error
  }

  return recorded
}

export async function createProjectNotifications({ projectId, currentUser, eventType, title, body, metadata = {} }) {
  if (!notificationsTableAvailable) {
    if (Date.now() < notificationsRetryAt) return []
    notificationsTableAvailable = true
  }

  const { data: project, error: projectError } = await supabaseAdmin
    .from('projects')
    .select('company_id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) throw projectError
  if (!project) return []

  const { data: memberships, error: membershipsError } = await supabaseAdmin
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', project.company_id)

  if (membershipsError) throw membershipsError

  const recipients = (memberships || [])
    .map((membership) => membership.user_id)
    .filter((userId) => userId && userId !== currentUser?.id)

  if (recipients.length === 0) return []

  const payload = recipients.map((userId) => ({
    user_id: userId,
    project_id: projectId,
    event_type: eventType,
    title,
    body,
    metadata,
  }))

  const { data, error } = await supabaseAdmin
    .from('notifications')
    .insert(payload)
    .select('id, user_id, project_id, event_type, title, body, read_at, metadata, created_at')

  if (error) {
    if (isMissingTableError(error, 'notifications')) {
      notificationsTableAvailable = false
      notificationsRetryAt = Date.now() + 30_000
      return []
    }

    throw error
  }

  return data || []
}

export function serializeActivity(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    actorLabel: row.actor_label,
    eventType: row.event_type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    title: row.title,
    description: row.description,
    metadata: row.metadata || {},
    createdAt: row.created_at,
  }
}
