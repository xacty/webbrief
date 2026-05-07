import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, MoreHorizontal, RotateCcw, Send, Trash2, Pencil } from 'lucide-react'
import styles from './CommentsUI.module.css'
import marginStyles from './CommentMarginCards.module.css'

const EDIT_WINDOW_MS = 15 * 60 * 1000
const CARD_GAP = 12

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
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function Avatar({ profile, fallbackName, size = 28 }) {
  const name = profile?.fullName || profile?.email || fallbackName || ''
  const url = profile?.avatarUrl
  const style = { width: size, height: size, fontSize: Math.round(size * 0.4) }
  if (url) style.backgroundImage = `url(${url})`
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
  compact = false,
}) {
  const profile = profilesById.get(comment.actorUserId)
  const isAuthor = comment.actorUserId === currentUserId
  const ageMs = Date.now() - new Date(comment.createdAt).getTime()
  const canEdit = isAuthor && ageMs < EDIT_WINDOW_MS && !comment.deletedAt
  const canDelete = (isAuthor || isAdmin) && !comment.deletedAt

  return (
    <div className={styles.commentItem} style={compact ? { padding: '2px 0' } : undefined}>
      <Avatar profile={profile} fallbackName={comment.authorName} size={compact ? 22 : 28} />
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
          <div className={marginStyles.entryActions}>
            {canEdit && (
              <button
                type="button"
                className={styles.actionBtn}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); onEdit?.(comment) }}
              >
                <Pencil size={11} /> Editar
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className={cx(styles.actionBtn, styles.actionBtnDanger)}
                onMouseDown={(e) => e.preventDefault()}
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
        rows={2}
      />
      <div className={styles.replyTextareaActions}>
        <button
          type="button"
          className={cx(styles.iconBtn, styles.iconBtnPrimary)}
          onMouseDown={(e) => e.preventDefault()}
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

function MarginCard({
  thread,
  profilesById,
  currentUser,
  isExpanded,
  onActivate,
  onReply,
  onResolve,
  onReopen,
  onEdit,
  onDelete,
  readOnly,
  position,
  setMeasuredHeight,
}) {
  const cardRef = useRef(null)
  const root = thread.root
  const isResolved = Boolean(root.resolvedAt)
  const isAdmin = currentUser?.platformRole === 'admin'

  useLayoutEffect(() => {
    if (!cardRef.current) return
    const h = cardRef.current.getBoundingClientRect().height
    setMeasuredHeight?.(thread.root.id, h)
  })

  return (
    <div
      ref={cardRef}
      className={cx(
        marginStyles.card,
        isExpanded && marginStyles.cardActive,
        isResolved && marginStyles.cardResolved,
      )}
      style={{ top: position }}
      data-thread-id={root.id}
      onClick={() => onActivate?.(root.id)}
    >
      {!isExpanded ? (
        <CommentEntry
          comment={root}
          profilesById={profilesById}
          currentUserId={currentUser?.id}
          isAdmin={isAdmin}
          showActions={false}
          compact
        />
      ) : (
        <>
          <CommentEntry
            comment={root}
            profilesById={profilesById}
            currentUserId={currentUser?.id}
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
              currentUserId={currentUser?.id}
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
            <div className={marginStyles.threadActions}>
              {isResolved ? (
                <button
                  type="button"
                  className={cx(styles.actionBtn, styles.actionBtnPrimary)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); onReopen(root.id) }}
                >
                  <RotateCcw size={12} /> Reabrir
                </button>
              ) : (
                <button
                  type="button"
                  className={cx(styles.actionBtn, styles.actionBtnPrimary)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); onResolve(root.id) }}
                >
                  <CheckCircle2 size={12} /> Resolver
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function CommentMarginCards({
  scrollAreaRef,
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
  showResolved = false,
}) {
  const profilesById = useMemo(() => new Map((profiles || []).map((p) => [p.id, p])), [profiles])
  const [anchorTops, setAnchorTops] = useState(new Map())
  const [cardHeights, setCardHeights] = useState(new Map())
  const [, forceTick] = useState(0)

  const visibleThreads = useMemo(() => {
    return threads.filter((thread) => {
      const isResolved = Boolean(thread.root.resolvedAt)
      if (!showResolved && isResolved) return false
      // skip orphans (anchor not in current doc)
      if (liveCommentIds && !liveCommentIds.has(thread.root.id)) return false
      return true
    })
  }, [threads, showResolved, liveCommentIds])

  // Measure anchor positions: re-run on scroll, resize, threads change, editor mutations.
  useLayoutEffect(() => {
    const scrollEl = scrollAreaRef?.current
    if (!scrollEl) return

    const measure = () => {
      const next = new Map()
      const scrollRect = scrollEl.getBoundingClientRect()
      for (const thread of visibleThreads) {
        const span = scrollEl.querySelector(`span[data-comment-id="${CSS.escape(thread.root.id)}"]`)
        if (!span) continue
        const rect = span.getBoundingClientRect()
        next.set(thread.root.id, rect.top - scrollRect.top + scrollEl.scrollTop)
      }
      setAnchorTops((prev) => {
        if (prev.size !== next.size) return next
        for (const [id, top] of next) {
          if (prev.get(id) !== top) return next
        }
        return prev
      })
    }

    measure()
    const onScroll = () => measure()
    const onResize = () => measure()
    scrollEl.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onResize)

    // MutationObserver to re-measure when editor DOM changes (typing, mark add/remove)
    const observer = new MutationObserver(() => measure())
    observer.observe(scrollEl, { childList: true, subtree: true, characterData: true })

    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      observer.disconnect()
    }
  }, [scrollAreaRef, visibleThreads])

  // Resolve overlaps: greedy top-down layout pass.
  // Active card prefers its natural top; others stack below the previous card.
  const layout = useMemo(() => {
    const positioned = []
    const sorted = visibleThreads
      .map((thread) => ({
        thread,
        anchorTop: anchorTops.get(thread.root.id),
        height: cardHeights.get(thread.root.id) || 80,
      }))
      .filter((entry) => typeof entry.anchorTop === 'number')
      .sort((a, b) => a.anchorTop - b.anchorTop)

    let cursor = -Infinity
    for (const entry of sorted) {
      const isActive = entry.thread.root.id === activeCommentId
      const desired = entry.anchorTop
      const top = Math.max(desired, cursor)
      positioned.push({ ...entry, top })
      cursor = top + entry.height + CARD_GAP
    }

    if (activeCommentId) {
      // If active card was pushed too far from its anchor, shift everything to align it.
      const active = positioned.find((entry) => entry.thread.root.id === activeCommentId)
      if (active && active.top !== active.anchorTop) {
        const delta = active.anchorTop - active.top
        // shift later cards up if delta < 0 (active wants to go higher)
        if (delta !== 0) {
          for (const entry of positioned) {
            entry.top = entry.top + delta
          }
          // re-resolve overlaps top-down again from active onwards
          const idx = positioned.findIndex((e) => e.thread.root.id === activeCommentId)
          if (idx >= 0) {
            for (let i = 0; i < positioned.length; i++) {
              if (i === 0) continue
              const prev = positioned[i - 1]
              const minTop = prev.top + prev.height + CARD_GAP
              if (positioned[i].top < minTop) positioned[i].top = minTop
            }
          }
        }
      }
    }

    return positioned
  }, [visibleThreads, anchorTops, cardHeights, activeCommentId])

  function handleSetMeasuredHeight(id, h) {
    setCardHeights((prev) => {
      if (prev.get(id) === h) return prev
      const next = new Map(prev)
      next.set(id, h)
      return next
    })
  }

  if (!scrollAreaRef?.current || layout.length === 0) return null

  return (
    <div className={marginStyles.cardsLayer} aria-label="Comentarios">
      {layout.map((entry) => (
        <MarginCard
          key={entry.thread.root.id}
          thread={entry.thread}
          profilesById={profilesById}
          currentUser={currentUser}
          isExpanded={activeCommentId === entry.thread.root.id}
          onActivate={onSelectThread}
          onReply={onReply}
          onResolve={onResolve}
          onReopen={onReopen}
          onEdit={onEdit}
          onDelete={onDelete}
          readOnly={readOnly}
          position={entry.top}
          setMeasuredHeight={handleSetMeasuredHeight}
        />
      ))}
    </div>
  )
}
