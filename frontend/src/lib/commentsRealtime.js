import { supabase } from './supabase'

// Suscribe a cambios de comentarios para un proyecto vía Supabase Realtime.
// Devuelve una función para limpiar la suscripción.
//
// El handler recibe { event: 'INSERT'|'UPDATE'|'DELETE', row, oldRow }
// donde row es el payload normalizado a camelCase para que el caller pueda
// merge-ear directamente con su state local.

function snakeToCamel(value) {
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, val] of Object.entries(value)) {
    const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    out[camel] = val
  }
  return out
}

function normalizeRow(row) {
  if (!row) return null
  const camel = snakeToCamel(row)
  return {
    id: camel.id,
    projectId: camel.projectId,
    pageId: camel.pageId,
    sectionId: camel.sectionId,
    parentCommentId: camel.parentCommentId,
    anchorSnippet: camel.anchorSnippet,
    mentions: Array.isArray(camel.mentions) ? camel.mentions : [],
    actorUserId: camel.actorUserId,
    authorName: camel.authorName,
    authorEmail: camel.authorEmail,
    body: camel.deletedAt ? '' : (camel.body || ''),
    source: camel.source,
    status: camel.status,
    resolvedAt: camel.resolvedAt,
    resolvedByUserId: camel.resolvedByUserId,
    editedAt: camel.editedAt,
    deletedAt: camel.deletedAt,
    deletedByUserId: camel.deletedByUserId,
    createdAt: camel.createdAt,
    updatedAt: camel.updatedAt,
  }
}

export function subscribeProjectComments(projectId, handler) {
  if (!projectId) return () => {}

  const channelName = `project:${projectId}:comments`
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'project_comments',
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        try {
          handler({
            event: payload.eventType,
            row: normalizeRow(payload.new),
            oldRow: normalizeRow(payload.old),
          })
        } catch (error) {
          console.warn('[commentsRealtime] handler threw:', error.message)
        }
      },
    )
    .subscribe()

  return () => {
    try {
      supabase.removeChannel(channel)
    } catch {
      // best-effort
    }
  }
}
