import { apiFetch } from './api'

export async function fetchComments(projectId, { pageId = null, includeResolved = true } = {}) {
  const params = new URLSearchParams()
  if (pageId) params.set('pageId', pageId)
  if (includeResolved) params.set('includeResolved', 'true')
  const query = params.toString()
  const path = `/api/projects/${projectId}/comments${query ? `?${query}` : ''}`
  const data = await apiFetch(path)
  return {
    comments: data?.comments || [],
    profiles: data?.profiles || [],
    members: data?.members || [],
    available: data?.commentsAvailable !== false,
  }
}

export async function createComment(projectId, { pageId, anchorSnippet, body, mentions = [] }) {
  const data = await apiFetch(`/api/projects/${projectId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ pageId, anchorSnippet, body, mentions }),
  })
  return data?.comment
}

export async function replyComment(projectId, commentId, { body, mentions = [] }) {
  const data = await apiFetch(`/api/projects/${projectId}/comments/${commentId}/replies`, {
    method: 'POST',
    body: JSON.stringify({ body, mentions }),
  })
  return data?.comment
}

export async function editComment(projectId, commentId, { body, mentions = [] }) {
  const data = await apiFetch(`/api/projects/${projectId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ body, mentions }),
  })
  return data?.comment
}

export async function deleteComment(projectId, commentId) {
  const data = await apiFetch(`/api/projects/${projectId}/comments/${commentId}`, {
    method: 'DELETE',
  })
  return data?.comment
}

export async function resolveComment(projectId, commentId) {
  const data = await apiFetch(`/api/projects/${projectId}/comments/${commentId}/resolve`, {
    method: 'POST',
  })
  return data?.comment
}

export async function reopenComment(projectId, commentId) {
  const data = await apiFetch(`/api/projects/${projectId}/comments/${commentId}/reopen`, {
    method: 'POST',
  })
  return data?.comment
}

// Agrupa una lista plana en threads { root, replies[] } ordenados por created_at del root.
// Mantiene replies ordenadas cronológicamente. Filtra duplicados por id.
export function groupCommentsIntoThreads(comments) {
  const byId = new Map()
  for (const c of comments) byId.set(c.id, c)
  const roots = []
  const repliesByRoot = new Map()

  for (const c of comments) {
    if (c.parentCommentId) {
      const list = repliesByRoot.get(c.parentCommentId) || []
      list.push(c)
      repliesByRoot.set(c.parentCommentId, list)
    } else {
      roots.push(c)
    }
  }

  return roots
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .map((root) => ({
      root,
      replies: (repliesByRoot.get(root.id) || []).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      ),
    }))
}
