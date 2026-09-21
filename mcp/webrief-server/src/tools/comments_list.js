import { z } from 'zod';
import { projectId, pageId } from '../schemas/common.js';
import { checkMcpToken } from '../auth/mcpToken.js';
import { get } from '../lib/webbriefClient.js';

export const name = 'comments_list';

export const description =
  'What: returns comment THREADS for a project — grouped into roots with nested replies, sorted ' +
  'oldest-first at every level. Each thread/reply carries id/pageId/sectionId/anchorSnippet/author ' +
  '(id+name only, no email)/body/createdAt/editedAt/resolved state/deleted state/mentions. ' +
  'When: use to see reviewer/client feedback on a project or page before editing content, or to check ' +
  'whether a section already has open comments. sectionId values match the ones returned by sections_list ' +
  'and accepted by pages_previewEdits / pages_applyEdits. ' +
  'Note: read-only. By default only OPEN threads are returned (resolved root comments and their replies are ' +
  'excluded) — pass includeResolved=true to see everything. A deleted comment keeps its thread position with ' +
  "body:'' and deleted:true, but a deleted root with no surviving (non-deleted) replies is omitted entirely. " +
  'Names are resolved from user profiles (fullName, falling back to email, falling back to the stored ' +
  'authorName) — there is no email field, but a name may be an email when the user has no full name. ' +
  'Side effects: none (read-only). ' +
  'Errors: mcp_token_missing, backend_unauthorized, project_not_found, backend_error.';

export const inputSchema = z.object({
  projectId: projectId.describe('UUID of the project whose comments to list'),
  pageId: pageId
    .optional()
    .describe('UUID of a page to restrict results to. Omit to list comments across the whole project.'),
  sectionId: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Restrict results to threads whose ROOT comment's sectionId matches this value (replies follow " +
        'their root regardless of their own sectionId). Values match sections_list / pages_previewEdits.'
    ),
  includeResolved: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include resolved threads (and their replies). Defaults to false (open threads only).'),
});

function resolveName(userId, profileMap, fallbackName) {
  if (userId) {
    const profile = profileMap.get(userId);
    if (profile) {
      return profile.fullName || profile.email || fallbackName || null;
    }
  }
  return fallbackName || null;
}

function toMentionRefs(mentions, profileMap) {
  return (mentions ?? []).map((id) => ({
    id,
    name: resolveName(id, profileMap, null),
  }));
}

function toReplyView(comment, profileMap) {
  const deleted = Boolean(comment.deletedAt);
  return {
    id: comment.id,
    author: { id: comment.actorUserId ?? null, name: resolveName(comment.actorUserId, profileMap, comment.authorName) },
    body: comment.body ?? '',
    createdAt: comment.createdAt,
    editedAt: comment.editedAt ?? null,
    deleted,
    mentions: toMentionRefs(comment.mentions, profileMap),
  };
}

function toThreadView(root, replies, profileMap) {
  const rootDeleted = Boolean(root.deletedAt);
  const resolved = Boolean(root.resolvedAt);
  return {
    id: root.id,
    pageId: root.pageId,
    sectionId: root.sectionId ?? null,
    anchorSnippet: root.anchorSnippet ?? null,
    author: { id: root.actorUserId ?? null, name: resolveName(root.actorUserId, profileMap, root.authorName) },
    body: root.body ?? '',
    createdAt: root.createdAt,
    editedAt: root.editedAt ?? null,
    resolved,
    resolvedAt: root.resolvedAt ?? null,
    resolvedBy: root.resolvedByUserId
      ? { id: root.resolvedByUserId, name: resolveName(root.resolvedByUserId, profileMap, null) }
      : null,
    deleted: rootDeleted,
    mentions: toMentionRefs(root.mentions, profileMap),
    replies: replies.map((reply) => toReplyView(reply, profileMap)),
  };
}

export async function handler(input) {
  const tokenError = checkMcpToken(name);
  if (tokenError) return tokenError;

  try {
    const params = [];
    if (input.pageId) params.push(`pageId=${encodeURIComponent(input.pageId)}`);
    if (input.includeResolved) params.push('includeResolved=true');
    const query = params.length ? `?${params.join('&')}` : '';

    const data = await get(`/projects/${input.projectId}/comments${query}`);
    const commentsAvailable = data?.commentsAvailable !== false;
    const comments = Array.isArray(data?.comments) ? data.comments : [];
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    if (!commentsAvailable) {
      return {
        status: 'ok',
        tool: name,
        projectId: input.projectId,
        pageId: input.pageId ?? null,
        sectionId: input.sectionId ?? null,
        includeResolved: Boolean(input.includeResolved),
        commentsAvailable: false,
        totalThreads: 0,
        totalComments: 0,
        threads: [],
      };
    }

    const byId = new Map(comments.map((c) => [c.id, c]));
    const repliesByParent = new Map();
    const roots = [];

    for (const comment of comments) {
      if (!comment.parentCommentId) {
        roots.push(comment);
        continue;
      }
      // Orphan replies (root missing from the returned set) are dropped.
      if (!byId.has(comment.parentCommentId)) continue;
      const list = repliesByParent.get(comment.parentCommentId) ?? [];
      list.push(comment);
      repliesByParent.set(comment.parentCommentId, list);
    }

    roots.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    let threads = roots.map((root) => {
      const replies = (repliesByParent.get(root.id) ?? [])
        .slice()
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      return { root, replies };
    });

    if (input.sectionId) {
      threads = threads.filter(({ root }) => root.sectionId === input.sectionId);
    }

    // A deleted root with no surviving (non-deleted) replies carries no
    // visible content — drop the whole thread rather than return an empty shell.
    threads = threads.filter(({ root, replies }) => {
      if (!root.deletedAt) return true;
      return replies.some((reply) => !reply.deletedAt);
    });

    const views = threads.map(({ root, replies }) => toThreadView(root, replies, profileMap));
    const totalComments = views.reduce((sum, t) => sum + 1 + t.replies.length, 0);

    return {
      status: 'ok',
      tool: name,
      projectId: input.projectId,
      pageId: input.pageId ?? null,
      sectionId: input.sectionId ?? null,
      includeResolved: Boolean(input.includeResolved),
      commentsAvailable: true,
      totalThreads: views.length,
      totalComments,
      threads: views,
    };
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'backend_unauthorized',
          message:
            'The MCP token was rejected by the backend. ' +
            'Make sure the token is valid and has not been revoked.',
          backendStatus: error.status,
        },
      };
    }

    if (error.status === 404) {
      return {
        status: 'error',
        tool: name,
        error: {
          code: 'project_not_found',
          message: `Project ${input.projectId} was not found or you do not have access to it.`,
          backendStatus: 404,
        },
      };
    }

    return {
      status: 'error',
      tool: name,
      error: {
        code: 'backend_error',
        message: error.message ?? 'Unexpected error listing comments.',
        backendStatus: error.status ?? null,
      },
    };
  }
}
