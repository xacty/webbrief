import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { rateLimiters } from '../middleware/security.js'
import { logSecurityEvent } from '../lib/securityAudit.js'
import { INPUT_LIMITS, normalizeText, normalizeOptionalSafeId } from '../lib/validation.js'
import {
  actorLabel,
  canAccessCompany,
  createProjectNotifications,
  getProjectById,
  isMissingTableError,
  logProjectActivity,
} from '../lib/projectAccess.js'
import { sendCommentEmail } from '../lib/commentEmails.js'

const router = Router()

router.use(requireAuth)

export const EDIT_WINDOW_MS = 15 * 60 * 1000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const COMMENT_COLUMNS = `
  id, project_id, page_id, section_id, parent_comment_id, anchor_snippet,
  mentions, actor_user_id, author_name, author_email, body, source, status,
  resolved_at, resolved_by_user_id, edited_at, deleted_at, deleted_by_user_id,
  created_at, updated_at
`

export function serializeComment(row) {
  if (!row) return null
  const isDeleted = Boolean(row.deleted_at)
  return {
    id: row.id,
    projectId: row.project_id,
    pageId: row.page_id,
    sectionId: row.section_id,
    parentCommentId: row.parent_comment_id,
    anchorSnippet: row.anchor_snippet,
    mentions: Array.isArray(row.mentions) ? row.mentions : [],
    actorUserId: row.actor_user_id,
    authorName: row.author_name,
    authorEmail: row.author_email,
    body: isDeleted ? '' : row.body,
    source: row.source,
    status: row.status,
    resolvedAt: row.resolved_at,
    resolvedByUserId: row.resolved_by_user_id,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    deletedByUserId: row.deleted_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

async function ensureProjectAccess(req, res) {
  const project = await getProjectById(req.params.id, req.currentUser)
  if (!project) {
    res.status(404).json({ error: 'Proyecto no encontrado' })
    return null
  }
  if (!canAccessCompany(req.currentUser, project.company_id)) {
    res.status(403).json({ error: 'Sin permiso para este proyecto' })
    return null
  }
  return project
}

async function fetchProjectMemberIds(companyId) {
  const { data, error } = await supabaseAdmin
    .from('company_memberships')
    .select('user_id')
    .eq('company_id', companyId)

  if (error) throw error
  return new Set((data || []).map((row) => row.user_id).filter(Boolean))
}

async function fetchProfilesByIds(userIds) {
  if (!userIds.length) return []
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, email, full_name, avatar_url')
    .in('id', userIds)

  if (error) throw error
  return data || []
}

export function sanitizeMentions(mentions, allowedSet) {
  if (!Array.isArray(mentions)) return []
  const seen = new Set()
  const valid = []
  for (const id of mentions) {
    if (!isUuid(id)) continue
    if (seen.has(id)) continue
    if (!allowedSet.has(id)) continue
    seen.add(id)
    valid.push(id)
    if (valid.length >= 20) break
  }
  return valid
}

function authorPayload(currentUser) {
  return {
    actor_user_id: currentUser.id,
    author_name: actorLabel(currentUser),
    author_email: currentUser.email || '',
  }
}

router.get('/:id/comments', async (req, res) => {
  try {
    const project = await ensureProjectAccess(req, res)
    if (!project) return

    const pageIdParam = normalizeOptionalSafeId(req.query.pageId)
    const includeResolved = String(req.query.includeResolved || '').toLowerCase() === 'true'

    let query = supabaseAdmin
      .from('project_comments')
      .select(COMMENT_COLUMNS)
      .eq('project_id', project.id)
      .order('created_at', { ascending: true })
      .limit(2000)

    if (pageIdParam) {
      query = query.eq('page_id', pageIdParam)
    }

    const { data, error } = await query

    if (error) {
      if (isMissingTableError(error, 'project_comments')) {
        return res.json({ comments: [], profiles: [], commentsAvailable: false })
      }
      return res.status(500).json({ error: error.message })
    }

    const rows = data || []
    const filtered = includeResolved
      ? rows
      : rows.filter((row) => {
          if (row.parent_comment_id) {
            const root = rows.find((r) => r.id === row.parent_comment_id)
            return !root?.resolved_at
          }
          return !row.resolved_at
        })

    const userIds = new Set()
    for (const row of filtered) {
      if (row.actor_user_id) userIds.add(row.actor_user_id)
      if (row.resolved_by_user_id) userIds.add(row.resolved_by_user_id)
      if (row.deleted_by_user_id) userIds.add(row.deleted_by_user_id)
      for (const mid of (row.mentions || [])) userIds.add(mid)
    }
    const memberIds = await fetchProjectMemberIds(project.company_id)
    for (const id of memberIds) userIds.add(id)
    const profiles = await fetchProfilesByIds([...userIds])
    const profileMap = new Map(profiles.map((p) => [p.id, p]))
    const members = [...memberIds]
      .map((id) => profileMap.get(id))
      .filter(Boolean)

    return res.json({
      comments: filtered.map(serializeComment),
      profiles: profiles.map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        avatarUrl: p.avatar_url,
      })),
      members: members.map((p) => ({
        id: p.id,
        email: p.email,
        fullName: p.full_name,
        avatarUrl: p.avatar_url,
      })),
      commentsAvailable: true,
    })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar los comentarios' })
  }
})

router.post('/:id/comments', rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const project = await ensureProjectAccess(req, res)
    if (!project) return

    const { pageId, anchorSnippet, body, mentions } = req.body
    const normalizedPageId = normalizeOptionalSafeId(pageId)
    const normalizedSnippet = normalizeText(anchorSnippet || '', INPUT_LIMITS.shortText)
    const normalizedBody = normalizeText(body || '', INPUT_LIMITS.comment)

    if (!normalizedBody) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' })
    }
    if (!normalizedPageId) {
      return res.status(400).json({ error: 'pageId es requerido' })
    }

    const memberIds = await fetchProjectMemberIds(project.company_id)
    const validMentions = sanitizeMentions(mentions, memberIds)

    const { data, error } = await supabaseAdmin
      .from('project_comments')
      .insert({
        project_id: project.id,
        page_id: normalizedPageId,
        anchor_snippet: normalizedSnippet || null,
        body: normalizedBody,
        mentions: validMentions,
        source: 'app',
        ...authorPayload(req.currentUser),
      })
      .select(COMMENT_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'comment_created',
      subjectType: 'comment',
      subjectId: data.id,
      title: `Nuevo comentario de ${data.author_name}`,
      description: data.body,
      metadata: {
        commentId: data.id,
        pageId: data.page_id,
        anchorSnippet: data.anchor_snippet,
        mentions: data.mentions || [],
      },
    })

    if (validMentions.length > 0) {
      await notifyMentionedUsers({
        project,
        rootRow: data,
        currentRow: data,
        currentUser: req.currentUser,
        mentions: validMentions,
        eventType: 'comment_mention',
      })
    }

    await logSecurityEvent(req, {
      action: 'project_comment_created',
      resourceType: 'comment',
      resourceId: data.id,
      projectId: project.id,
      metadata: { pageId: data.page_id, mentions: validMentions.length },
    })

    return res.status(201).json({ comment: serializeComment(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear el comentario' })
  }
})

router.post('/:id/comments/:commentId/replies', rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const project = await ensureProjectAccess(req, res)
    if (!project) return

    if (!isUuid(req.params.commentId)) {
      return res.status(400).json({ error: 'commentId inválido' })
    }

    const { data: rootRow, error: rootError } = await supabaseAdmin
      .from('project_comments')
      .select(COMMENT_COLUMNS)
      .eq('id', req.params.commentId)
      .eq('project_id', project.id)
      .maybeSingle()

    if (rootError) return res.status(500).json({ error: rootError.message })
    if (!rootRow) return res.status(404).json({ error: 'Comentario no encontrado' })
    if (rootRow.parent_comment_id) {
      return res.status(400).json({ error: 'No se puede responder a una réplica' })
    }

    const { body, mentions } = req.body
    const normalizedBody = normalizeText(body || '', INPUT_LIMITS.comment)
    if (!normalizedBody) {
      return res.status(400).json({ error: 'La respuesta no puede estar vacía' })
    }

    const memberIds = await fetchProjectMemberIds(project.company_id)
    const validMentions = sanitizeMentions(mentions, memberIds)

    const { data, error } = await supabaseAdmin
      .from('project_comments')
      .insert({
        project_id: project.id,
        page_id: rootRow.page_id,
        parent_comment_id: rootRow.id,
        anchor_snippet: null,
        body: normalizedBody,
        mentions: validMentions,
        source: 'app',
        ...authorPayload(req.currentUser),
      })
      .select(COMMENT_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    const recipients = await collectThreadRecipients({
      projectId: project.id,
      rootId: rootRow.id,
      excludeUserId: req.currentUser.id,
    })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'comment_replied',
      subjectType: 'comment',
      subjectId: data.id,
      title: `${data.author_name} respondió un comentario`,
      description: data.body,
      metadata: {
        commentId: data.id,
        rootCommentId: rootRow.id,
        pageId: data.page_id,
        mentions: data.mentions || [],
      },
    })

    if (recipients.size > 0) {
      await notifyUsers({
        project,
        rootRow,
        currentRow: data,
        currentUser: req.currentUser,
        recipientUserIds: [...recipients],
        eventType: 'comment_reply',
        title: `${data.author_name} respondió en ${project.name || 'un proyecto'}`,
      })
    }

    if (validMentions.length > 0) {
      const newMentions = validMentions.filter((id) => !recipients.has(id) && id !== req.currentUser.id)
      if (newMentions.length > 0) {
        await notifyMentionedUsers({
          project,
          rootRow,
          currentRow: data,
          currentUser: req.currentUser,
          mentions: newMentions,
          eventType: 'comment_mention',
        })
      }
    }

    return res.status(201).json({ comment: serializeComment(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo crear la réplica' })
  }
})

router.patch('/:id/comments/:commentId', rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const project = await ensureProjectAccess(req, res)
    if (!project) return
    if (!isUuid(req.params.commentId)) {
      return res.status(400).json({ error: 'commentId inválido' })
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('project_comments')
      .select(COMMENT_COLUMNS)
      .eq('id', req.params.commentId)
      .eq('project_id', project.id)
      .maybeSingle()

    if (fetchError) return res.status(500).json({ error: fetchError.message })
    if (!existing) return res.status(404).json({ error: 'Comentario no encontrado' })
    if (existing.deleted_at) return res.status(410).json({ error: 'Comentario eliminado' })
    if (existing.actor_user_id !== req.currentUser.id) {
      return res.status(403).json({ error: 'Solo el autor puede editar' })
    }

    const ageMs = Date.now() - new Date(existing.created_at).getTime()
    if (ageMs > EDIT_WINDOW_MS) {
      return res.status(403).json({ error: 'La ventana de edición de 15 minutos ya pasó' })
    }

    const { body, mentions } = req.body
    const normalizedBody = normalizeText(body || '', INPUT_LIMITS.comment)
    if (!normalizedBody) {
      return res.status(400).json({ error: 'El comentario no puede estar vacío' })
    }

    const memberIds = await fetchProjectMemberIds(project.company_id)
    const validMentions = sanitizeMentions(mentions, memberIds)

    const { data, error } = await supabaseAdmin
      .from('project_comments')
      .update({
        body: normalizedBody,
        mentions: validMentions,
        edited_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select(COMMENT_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    const newMentions = validMentions.filter((id) => !(existing.mentions || []).includes(id) && id !== req.currentUser.id)
    if (newMentions.length > 0) {
      const rootRow = existing.parent_comment_id
        ? (await supabaseAdmin.from('project_comments').select(COMMENT_COLUMNS).eq('id', existing.parent_comment_id).maybeSingle()).data
        : data
      await notifyMentionedUsers({
        project,
        rootRow: rootRow || data,
        currentRow: data,
        currentUser: req.currentUser,
        mentions: newMentions,
        eventType: 'comment_mention',
      })
    }

    return res.json({ comment: serializeComment(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo editar el comentario' })
  }
})

router.delete('/:id/comments/:commentId', rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const project = await ensureProjectAccess(req, res)
    if (!project) return
    if (!isUuid(req.params.commentId)) {
      return res.status(400).json({ error: 'commentId inválido' })
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('project_comments')
      .select(COMMENT_COLUMNS)
      .eq('id', req.params.commentId)
      .eq('project_id', project.id)
      .maybeSingle()

    if (fetchError) return res.status(500).json({ error: fetchError.message })
    if (!existing) return res.status(404).json({ error: 'Comentario no encontrado' })
    if (existing.deleted_at) return res.json({ comment: serializeComment(existing) })

    const isAdmin = req.currentUser.platformRole === 'admin'
    if (existing.actor_user_id !== req.currentUser.id && !isAdmin) {
      return res.status(403).json({ error: 'Solo el autor puede eliminar' })
    }

    if (!existing.parent_comment_id) {
      const { count: replyCount } = await supabaseAdmin
        .from('project_comments')
        .select('id', { count: 'exact', head: true })
        .eq('parent_comment_id', existing.id)
        .is('deleted_at', null)

      if (!replyCount) {
        const { error: deleteError } = await supabaseAdmin
          .from('project_comments')
          .delete()
          .eq('id', existing.id)

        if (deleteError) return res.status(500).json({ error: deleteError.message })
        return res.json({ comment: { ...serializeComment(existing), deletedAt: new Date().toISOString() }, hardDeleted: true })
      }
    }

    const { data, error } = await supabaseAdmin
      .from('project_comments')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_user_id: req.currentUser.id,
      })
      .eq('id', existing.id)
      .select(COMMENT_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    return res.json({ comment: serializeComment(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo eliminar el comentario' })
  }
})

router.post('/:id/comments/:commentId/resolve', rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const project = await ensureProjectAccess(req, res)
    if (!project) return
    if (!isUuid(req.params.commentId)) {
      return res.status(400).json({ error: 'commentId inválido' })
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('project_comments')
      .select(COMMENT_COLUMNS)
      .eq('id', req.params.commentId)
      .eq('project_id', project.id)
      .maybeSingle()

    if (fetchError) return res.status(500).json({ error: fetchError.message })
    if (!existing) return res.status(404).json({ error: 'Comentario no encontrado' })
    if (existing.parent_comment_id) {
      return res.status(400).json({ error: 'Solo el root del thread puede resolverse' })
    }
    if (existing.resolved_at) return res.json({ comment: serializeComment(existing) })

    const { data, error } = await supabaseAdmin
      .from('project_comments')
      .update({
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: req.currentUser.id,
        status: 'resolved',
      })
      .eq('id', existing.id)
      .select(COMMENT_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'comment_resolved',
      subjectType: 'comment',
      subjectId: data.id,
      title: `${actorLabel(req.currentUser)} resolvió un comentario`,
      description: existing.body,
      metadata: {
        commentId: data.id,
        pageId: data.page_id,
      },
    })

    return res.json({ comment: serializeComment(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo resolver el comentario' })
  }
})

router.post('/:id/comments/:commentId/reopen', rateLimiters.sensitiveAction, async (req, res) => {
  try {
    const project = await ensureProjectAccess(req, res)
    if (!project) return
    if (!isUuid(req.params.commentId)) {
      return res.status(400).json({ error: 'commentId inválido' })
    }

    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('project_comments')
      .select(COMMENT_COLUMNS)
      .eq('id', req.params.commentId)
      .eq('project_id', project.id)
      .maybeSingle()

    if (fetchError) return res.status(500).json({ error: fetchError.message })
    if (!existing) return res.status(404).json({ error: 'Comentario no encontrado' })
    if (existing.parent_comment_id) {
      return res.status(400).json({ error: 'Solo el root del thread puede reabrirse' })
    }
    if (!existing.resolved_at) return res.json({ comment: serializeComment(existing) })

    const { data, error } = await supabaseAdmin
      .from('project_comments')
      .update({
        resolved_at: null,
        resolved_by_user_id: null,
        status: 'open',
      })
      .eq('id', existing.id)
      .select(COMMENT_COLUMNS)
      .single()

    if (error) return res.status(500).json({ error: error.message })

    await logProjectActivity({
      projectId: project.id,
      currentUser: req.currentUser,
      eventType: 'comment_reopened',
      subjectType: 'comment',
      subjectId: data.id,
      title: `${actorLabel(req.currentUser)} reabrió un comentario`,
      description: existing.body,
      metadata: { commentId: data.id, pageId: data.page_id },
    })

    return res.json({ comment: serializeComment(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo reabrir el comentario' })
  }
})

async function collectThreadRecipients({ projectId, rootId, excludeUserId }) {
  const { data, error } = await supabaseAdmin
    .from('project_comments')
    .select('actor_user_id')
    .eq('project_id', projectId)
    .or(`id.eq.${rootId},parent_comment_id.eq.${rootId}`)

  if (error) throw error
  const ids = new Set()
  for (const row of (data || [])) {
    if (row.actor_user_id && row.actor_user_id !== excludeUserId) {
      ids.add(row.actor_user_id)
    }
  }
  return ids
}

async function notifyUsers({
  project,
  rootRow,
  currentRow,
  currentUser,
  recipientUserIds,
  eventType,
  title,
}) {
  if (!recipientUserIds.length) return
  const body = currentRow.body?.slice(0, 240) || ''
  const metadata = {
    commentId: currentRow.id,
    rootCommentId: rootRow.id,
    pageId: currentRow.page_id,
    projectId: project.id,
    actorId: currentUser.id,
    actorLabel: actorLabel(currentUser),
  }

  try {
    const payload = recipientUserIds.map((userId) => ({
      user_id: userId,
      project_id: project.id,
      event_type: eventType,
      title,
      body,
      metadata,
    }))
    const { error } = await supabaseAdmin.from('notifications').insert(payload)
    if (error && !isMissingTableError(error, 'notifications')) {
      console.warn('[comments] notifications insert failed:', error.message)
    }
  } catch (err) {
    console.warn('[comments] notifications threw:', err.message)
  }

  if (eventType === 'comment_mention' || eventType === 'comment_reply') {
    const profiles = await fetchProfilesByIds(recipientUserIds)
    for (const profile of profiles) {
      if (!profile.email) continue
      sendCommentEmail({
        to: profile.email,
        recipientName: profile.full_name || profile.email,
        actorName: actorLabel(currentUser),
        projectName: project.name || 'WeBrief',
        projectId: project.id,
        commentId: currentRow.id,
        rootCommentId: rootRow.id,
        body,
        eventType,
      }).catch((err) => console.warn('[comments] email send failed:', err.message))
    }
  }
}

async function notifyMentionedUsers({
  project,
  rootRow,
  currentRow,
  currentUser,
  mentions,
  eventType,
}) {
  const recipients = mentions.filter((id) => id !== currentUser.id)
  if (!recipients.length) return
  await notifyUsers({
    project,
    rootRow,
    currentRow,
    currentUser,
    recipientUserIds: recipients,
    eventType,
    title: `${actorLabel(currentUser)} te mencionó en ${project.name || 'un proyecto'}`,
  })
}

export default router
