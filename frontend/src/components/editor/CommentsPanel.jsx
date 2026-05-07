import { useMemo, useRef, useState, useEffect } from 'react'
import { CheckCircle2, MoreHorizontal, Reply, RotateCcw, Send, Trash2, Pencil, X } from 'lucide-react'
import styles from './CommentsUI.module.css'

const FILTER_OPTIONS = [
  { id: 'open', label: 'Sin resolver' },
  { id: 'resolved', label: 'Resueltos' },
  { id: 'all', label: 'Todos' },
]

const EDIT_WINDOW_MS = 15 * 60 * 1000

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

function formatRelativeTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return 'hace un momento'
  if (ms < 3_600_000) return `hace ${Math.floor(ms / 60_000)} min`
  if (ms < 86_400_000) return `hace ${Math.floor(ms / 3_600_000)} h`
  if (ms < 7 * 86_400_000) return `hace ${Math.floor(ms / 86_400_000)} d`
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

function getInitials(name) {
  if (!name) return '?'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || '?'
}

function Avatar({ profile, fallbackName }) {
  const name = profile?.fullName || profile?.email || fallbackName || ''
  const url = profile?.avatarUrl
  const style = url ? { backgroundImage: `url(${url})` } : undefined
  return (
    <div className={styles.avatar} style={style}>
      {url ? '' : getInitials(name)}
    </div>
  )
}

function CommentEntry({
  comment,
  profilesById,
  currentUserId,
  isAdmin,
  onEdit,
  onDelete,
  showActions = true,
}) {
  const profile = profilesById.get(comment.actorUserId)
  const isAuthor = comment.actorUserId === currentUserId
  const ageMs = Date.now() - new Date(comment.createdAt).getTime()
  const canEdit = isAuthor && ageMs < EDIT_WINDOW_MS && !comment.deletedAt
  const canDelete = (isAuthor || isAdmin) && !comment.deletedAt

  return (
    <div className={styles.commentItem}>
      <Avatar profile={profile} fallbackName={comment.authorName} />
      <div className={styles.commentBody}>
        <div className={styles.commentMeta}>
          <span className={styles.commentAuthor}>{profile?.fullName || comment.authorName}</span>
          <span className={styles.commentTime}>{formatRelativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span className={styles.commentEdited}>(editado)</span>}
        </div>
        {comment.deletedAt ? (
          <p className={styles.commentDeleted}>(comentario eliminado)</p>
        ) : (
          <p className={styles.commentText}>{comment.body}</p>
        )}
        {showActions && (canEdit || canDelete) && (
          <div className={styles.threadActions} style={{ marginTop: 4, paddingTop: 4, borderTop: 'none' }}>
            {canEdit && (
              <button
                type="button"
                className={styles.actionBtn}
                onClick={(e) => { e.stopPropagation(); onEdit?.(comment) }}
              >
                <Pencil size={11} /> Editar
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className={cx(styles.actionBtn, styles.actionBtnDanger)}
                onClick={(e) => { e.stopPropagation(); onDelete?.(comment) }}
              >
                <Trash2 size={11} /> Eliminar
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ReplyForm({ onSubmit, disabled }) {
  const [value, setValue] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef(null)

  async function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || submitting || disabled) return
    setSubmitting(true)
    try {
      await onSubmit(trimmed)
      setValue('')
    } finally {
      setSubmitting(false)
    }
  }

  function handleKey(event) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className={styles.replyForm} onClick={(e) => e.stopPropagation()}>
      <textarea
        ref={textareaRef}
        className={styles.replyTextarea}
        placeholder="Responder…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKey}
        disabled={disabled || submitting}
      />
      <div className={styles.replyTextareaActions}>
        <button
          type="button"
          className={cx(styles.iconBtn, styles.iconBtnPrimary)}
          onClick={handleSubmit}
          disabled={!value.trim() || submitting || disabled}
          aria-label="Enviar"
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}

function ThreadCard({
  thread,
  profilesById,
  currentUserId,
  isAdmin,
  active,
  onClick,
  onReply,
  onResolve,
  onReopen,
  onEdit,
  onDelete,
  readOnly,
  orphan,
}) {
  const root = thread.root
  const isResolved = Boolean(root.resolvedAt)

  return (
    <div
      className={cx(
        styles.threadCard,
        active && styles.threadCardActive,
        isResolved && styles.threadCardResolved,
      )}
      onClick={() => onClick?.(root.id)}
      data-thread-id={root.id}
    >
      {root.anchorSnippet && (
        <div className={cx(styles.threadAnchor, orphan && styles.threadAnchorOrphan)}>
          {orphan ? '(texto eliminado) ' : ''}“{root.anchorSnippet}”
        </div>
      )}
      <CommentEntry
        comment={root}
        profilesById={profilesById}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onEdit={onEdit}
        onDelete={onDelete}
        showActions={!readOnly}
      />
      {thread.replies.map((reply) => (
        <CommentEntry
          key={reply.id}
          comment={reply}
          profilesById={profilesById}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
          showActions={!readOnly}
        />
      ))}
      {!readOnly && (
        <ReplyForm onSubmit={(body) => onReply(root.id, body)} disabled={isResolved} />
      )}
      {!readOnly && (
        <div className={styles.threadActions}>
          {isResolved ? (
            <button
              type="button"
              className={cx(styles.actionBtn, styles.actionBtnPrimary)}
              onClick={(e) => { e.stopPropagation(); onReopen(root.id) }}
            >
              <RotateCcw size={12} /> Reabrir
            </button>
          ) : (
            <button
              type="button"
              className={cx(styles.actionBtn, styles.actionBtnPrimary)}
              onClick={(e) => { e.stopPropagation(); onResolve(root.id) }}
            >
              <CheckCircle2 size={12} /> Resolver
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function CommentsPanel({
  threads = [],
  profiles = [],
  currentUser,
  activeCommentId = null,
  liveCommentIds = null,
  onSelectThread,
  onReply,
  onResolve,
  onReopen,
  onEdit,
  onDelete,
  readOnly = false,
  isLoading = false,
  isRefreshing = false,
}) {
  const [filter, setFilter] = useState('open')
  const profilesById = useMemo(() => new Map((profiles || []).map((p) => [p.id, p])), [profiles])
  const isAdmin = currentUser?.platformRole === 'admin'

  const visibleThreads = useMemo(() => {
    return threads.filter((thread) => {
      const isResolved = Boolean(thread.root.resolvedAt)
      if (filter === 'open' && isResolved) return false
      if (filter === 'resolved' && !isResolved) return false
      return true
    })
  }, [threads, filter])

  const orderedThreads = useMemo(() => {
    if (!liveCommentIds) return visibleThreads
    const present = []
    const orphans = []
    for (const thread of visibleThreads) {
      if (liveCommentIds.has(thread.root.id)) present.push(thread)
      else orphans.push(thread)
    }
    return [...present, ...orphans]
  }, [visibleThreads, liveCommentIds])

  useEffect(() => {
    if (!activeCommentId) return
    const card = document.querySelector(`[data-thread-id="${activeCommentId}"]`)
    if (card) {
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [activeCommentId])

  return (
    <>
      <div className={styles.commentsHeader}>
        <div className={styles.commentsTitle}>Comentarios</div>
        <div className={styles.commentsFilters}>
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={cx(styles.filterChip, filter === option.id && styles.filterChipActive)}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.commentsList}>
        {isLoading && threads.length === 0 ? (
          <p className={styles.commentsEmpty}>Cargando…</p>
        ) : orderedThreads.length === 0 ? (
          <p className={styles.commentsEmpty}>
            {filter === 'open'
              ? 'No hay comentarios abiertos en esta página.'
              : filter === 'resolved'
              ? 'No hay comentarios resueltos.'
              : 'No hay comentarios todavía.'}
          </p>
        ) : (
          orderedThreads.map((thread) => {
            const orphan = liveCommentIds ? !liveCommentIds.has(thread.root.id) : false
            return (
              <ThreadCard
                key={thread.root.id}
                thread={thread}
                profilesById={profilesById}
                currentUserId={currentUser?.id}
                isAdmin={isAdmin}
                active={activeCommentId === thread.root.id}
                onClick={onSelectThread}
                onReply={onReply}
                onResolve={onResolve}
                onReopen={onReopen}
                onEdit={onEdit}
                onDelete={onDelete}
                readOnly={readOnly}
                orphan={orphan}
              />
            )
          })
        )}
      </div>
    </>
  )
}
