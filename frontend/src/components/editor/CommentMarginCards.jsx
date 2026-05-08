import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, MoreHorizontal, RotateCcw, Send, Trash2, Pencil, Link as LinkIcon } from 'lucide-react'
import styles from './CommentsUI.module.css'
import marginStyles from './CommentMarginCards.module.css'
import MentionsAutocomplete, {
  detectMentionQuery,
  filterMembers,
  filterMentionsByBody,
  insertMention,
} from './MentionsAutocomplete'

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

// Convierte @Nombre en <a href="mailto:..."> cuando el nombre matchea un mencionado real.
// Solo linkea menciones que figuren en `comment.mentions` (IDs validados server-side).
// Si no hay match (p.ej. perfil ya no está disponible o no se mencionó realmente),
// queda como texto plano para evitar generar links a cualquier `@palabra` casual.
function renderMentionedBody({ body, mentions, profilesById }) {
  if (!body) return body
  if (!Array.isArray(mentions) || mentions.length === 0) return body

  const candidates = mentions
    .map((id) => profilesById.get(id))
    .filter(Boolean)
    .map((p) => ({ name: p.fullName || p.email || 'Usuario', email: p.email || '', profile: p }))

  if (candidates.length === 0) return body

  // Ordenar por longitud desc para matchear "Juan Pérez" antes que "Juan".
  candidates.sort((a, b) => b.name.length - a.name.length)

  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = candidates.map((c) => escape(c.name)).join('|')
  const regex = new RegExp(`@(${pattern})`, 'g')

  const out = []
  let lastIdx = 0
  let match
  let key = 0
  while ((match = regex.exec(body)) !== null) {
    if (match.index > lastIdx) out.push(body.slice(lastIdx, match.index))
    const c = candidates.find((cand) => cand.name === match[1])
    if (c && c.email) {
      out.push(
        <a
          key={`m-${key++}`}
          href={`mailto:${c.email}`}
          className={marginStyles.mentionLink}
          onClick={(e) => e.stopPropagation()}
        >
          @{c.name}
        </a>,
      )
    } else {
      out.push(`@${match[1]}`)
    }
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < body.length) out.push(body.slice(lastIdx))
  return out
}

function Avatar({ profile, fallbackName, size = 26 }) {
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

function CommentMenu({ open, anchorRect, onClose, items }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    function down(e) { if (!ref.current?.contains(e.target)) onClose?.() }
    function esc(e) { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', esc)
    }
  }, [open, onClose])
  if (!open || !anchorRect) return null
  const style = {
    position: 'fixed',
    top: anchorRect.bottom + 4,
    left: Math.max(8, Math.min(window.innerWidth - 180, anchorRect.right - 160)),
    zIndex: 1500,
  }
  return (
    <div ref={ref} className={marginStyles.commentMenu} style={style} role="menu">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={cx(marginStyles.commentMenuItem, item.danger && marginStyles.commentMenuItemDanger)}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); item.onSelect(); onClose?.() }}
        >
          {item.icon ? <item.icon size={13} /> : null}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

export function CommentEntry({
  comment,
  profilesById,
  currentUserId,
  isAdmin,
  onEdit,
  onDelete,
  onCopyLink,
  showMenu = true,
  trailing = null,
}) {
  const profile = profilesById.get(comment.actorUserId)
  const isAuthor = comment.actorUserId === currentUserId
  const ageMs = Date.now() - new Date(comment.createdAt).getTime()
  const canEdit = isAuthor && ageMs < EDIT_WINDOW_MS && !comment.deletedAt
  const canDelete = (isAuthor || isAdmin) && !comment.deletedAt
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuRect, setMenuRect] = useState(null)
  const dotsRef = useRef(null)

  const items = []
  if (canEdit) items.push({ label: 'Editar', icon: Pencil, onSelect: () => onEdit?.(comment) })
  if (canDelete) items.push({ label: 'Eliminar', icon: Trash2, danger: true, onSelect: () => onDelete?.(comment) })
  if (onCopyLink) items.push({ label: 'Copiar link al comentario', icon: LinkIcon, onSelect: () => onCopyLink(comment) })

  function openMenu() {
    if (!dotsRef.current) return
    setMenuRect(dotsRef.current.getBoundingClientRect())
    setMenuOpen(true)
  }

  return (
    <div className={marginStyles.entry}>
      <Avatar profile={profile} fallbackName={comment.authorName} size={26} />
      <div className={marginStyles.entryBody}>
        <div className={marginStyles.entryHeader}>
          <span className={marginStyles.entryAuthor}>{profile?.fullName || comment.authorName}</span>
          <span className={marginStyles.entryTime}>{formatRelativeTime(comment.createdAt)}</span>
          {comment.editedAt && <span className={marginStyles.entryEdited}>(editado)</span>}
          <div className={marginStyles.headerTrailing}>
            {trailing}
            {showMenu && items.length > 0 && (
              <button
                ref={dotsRef}
                type="button"
                className={marginStyles.dotsBtn}
                onMouseDown={(e) => e.preventDefault()}
                onClick={(e) => { e.stopPropagation(); openMenu() }}
                aria-label="Más opciones"
              >
                <MoreHorizontal size={14} />
              </button>
            )}
          </div>
        </div>
        {comment.deletedAt ? (
          <p className={marginStyles.entryDeleted}>(comentario eliminado)</p>
        ) : (
          <p className={marginStyles.entryText}>
            {renderMentionedBody({
              body: comment.body,
              mentions: comment.mentions,
              profilesById,
            })}
          </p>
        )}
      </div>
      <CommentMenu
        open={menuOpen}
        anchorRect={menuRect}
        onClose={() => setMenuOpen(false)}
        items={items}
      />
    </div>
  )
}

export function ReplyComposer({ onSubmit, currentUser, members = [], disabled }) {
  const [active, setActive] = useState(false)
  const [value, setValue] = useState('')
  const [mentionUserIds, setMentionUserIds] = useState([])
  const [mentionQuery, setMentionQuery] = useState(null)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef(null)

  const mentionItems = useMemo(
    () => filterMembers(members, mentionQuery?.query || ''),
    [members, mentionQuery?.query],
  )

  // Reset selección al cambiar la query
  useEffect(() => { setMentionIndex(0) }, [mentionQuery?.query])

  useEffect(() => {
    if (active) textareaRef.current?.focus()
  }, [active])

  async function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || submitting || disabled) return
    const presentMentions = filterMentionsByBody(mentionUserIds, value, members)
    setSubmitting(true)
    try {
      await onSubmit(trimmed, presentMentions)
      setValue('')
      setMentionUserIds([])
      setMentionQuery(null)
      setActive(false)
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel(e) {
    e?.stopPropagation()
    setValue('')
    setMentionUserIds([])
    setMentionQuery(null)
    setActive(false)
  }

  function handleChange(event) {
    const next = event.target.value
    setValue(next)
    const cursor = event.target.selectionStart || 0
    setMentionQuery(detectMentionQuery(next, cursor))
  }

  function handleMentionSelect(profile) {
    if (!mentionQuery || !textareaRef.current) return
    const ta = textareaRef.current
    const result = insertMention({
      text: value,
      mentionQuery,
      profile,
      textareaSelectionStart: ta.selectionStart || mentionQuery.startIdx,
    })
    if (!result) return
    setValue(result.next)
    setMentionQuery(null)
    setMentionUserIds((prev) => (prev.includes(profile.id) ? prev : [...prev, profile.id]))
    window.requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(result.cursor, result.cursor)
    })
  }

  function handleKey(event) {
    // Mention dropdown abierto y con items: hijack ↓↑ Enter Tab Esc
    if (mentionItems.length > 0 && mentionQuery) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setMentionIndex((i) => Math.min(i + 1, mentionItems.length - 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setMentionIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault()
        const selected = mentionItems[mentionIndex] || mentionItems[0]
        if (selected) handleMentionSelect(selected)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionQuery(null)
        return
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      handleCancel()
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  if (!active) {
    return (
      <button
        type="button"
        className={marginStyles.replyTrigger}
        onClick={(e) => { e.stopPropagation(); setActive(true) }}
        disabled={disabled}
      >
        Responder…
      </button>
    )
  }

  const mentionsAnchor = mentionQuery && textareaRef.current
    ? (() => {
        const rect = textareaRef.current.getBoundingClientRect()
        return { left: rect.left + 8, top: rect.bottom + 4 }
      })()
    : null

  return (
    <div className={marginStyles.replyComposer} onClick={(e) => e.stopPropagation()}>
      <div className={marginStyles.replyComposerHeader}>
        <Avatar profile={currentUser ? { fullName: currentUser.fullName, avatarUrl: currentUser.avatarUrl } : null} fallbackName={currentUser?.fullName || currentUser?.email || ''} size={22} />
        <span className={marginStyles.replyComposerName}>{currentUser?.fullName || currentUser?.email || 'Tú'}</span>
      </div>
      <textarea
        ref={textareaRef}
        className={marginStyles.replyTextarea}
        placeholder="Comentario o @menciona miembros"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        disabled={disabled || submitting}
        rows={2}
      />
      <div className={marginStyles.replyComposerActions}>
        <button
          type="button"
          className={marginStyles.cancelBtn}
          onClick={handleCancel}
          disabled={submitting}
        >
          Cancelar
        </button>
        <button
          type="button"
          className={marginStyles.submitBtn}
          onClick={handleSubmit}
          disabled={!value.trim() || submitting || disabled}
        >
          Responder
        </button>
      </div>
      {mentionsAnchor && (
        <MentionsAutocomplete
          items={mentionItems}
          selectedIndex={mentionIndex}
          onSelect={handleMentionSelect}
          anchorPoint={mentionsAnchor}
        />
      )}
    </div>
  )
}

function MarginCard({
  thread,
  profilesById,
  currentUser,
  members = [],
  isExpanded,
  onActivate,
  onReply,
  onResolve,
  onReopen,
  onEdit,
  onDelete,
  onCopyLink,
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

  const replyCount = thread.replies.length
  const showReplies = isExpanded || replyCount === 0
  const hiddenRepliesCount = !isExpanded ? replyCount : 0

  const resolveTrailing = !readOnly && isExpanded
    ? (isResolved ? (
        <button
          type="button"
          className={marginStyles.iconChip}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onReopen(root.id) }}
          data-wb-tooltip="Reabrir"
          aria-label="Reabrir"
        >
          <RotateCcw size={14} />
        </button>
      ) : (
        <button
          type="button"
          className={marginStyles.iconChip}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onResolve(root.id) }}
          data-wb-tooltip="Resolver"
          aria-label="Resolver"
        >
          <CheckCircle2 size={14} />
        </button>
      ))
    : null

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
      <CommentEntry
        comment={root}
        profilesById={profilesById}
        currentUserId={currentUser?.id}
        isAdmin={isAdmin}
        onEdit={onEdit}
        onDelete={onDelete}
        onCopyLink={onCopyLink}
        showMenu={!readOnly}
        trailing={resolveTrailing}
      />

      {showReplies && thread.replies.map((reply) => (
        <CommentEntry
          key={reply.id}
          comment={reply}
          profilesById={profilesById}
          currentUserId={currentUser?.id}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
          onCopyLink={onCopyLink}
          showMenu={!readOnly}
        />
      ))}

      {!isExpanded && hiddenRepliesCount > 0 && (
        <div className={marginStyles.repliesBadge}>
          {hiddenRepliesCount} {hiddenRepliesCount === 1 ? 'respuesta' : 'respuestas'}
        </div>
      )}

      {isExpanded && !readOnly && (
        <ReplyComposer
          onSubmit={(body, mentions) => onReply(root.id, body, mentions)}
          currentUser={currentUser}
          members={members}
          disabled={isResolved}
        />
      )}
    </div>
  )
}

export default function CommentMarginCards({
  scrollAreaRef,
  threads = [],
  profiles = [],
  members = [],
  currentUser,
  activeCommentId = null,
  liveCommentIds = null,
  onSelectThread,
  onReply,
  onResolve,
  onReopen,
  onEdit,
  onDelete,
  onCopyLink,
  readOnly = false,
  showResolved = false,
}) {
  const profilesById = useMemo(() => new Map((profiles || []).map((p) => [p.id, p])), [profiles])
  const [anchorTops, setAnchorTops] = useState(new Map())
  const [cardHeights, setCardHeights] = useState(new Map())

  const visibleThreads = useMemo(() => {
    return threads.filter((thread) => {
      const isResolved = Boolean(thread.root.resolvedAt)
      if (!showResolved && isResolved) return false
      if (liveCommentIds && !liveCommentIds.has(thread.root.id)) return false
      return true
    })
  }, [threads, showResolved, liveCommentIds])

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

    const observer = new MutationObserver(() => measure())
    observer.observe(scrollEl, { childList: true, subtree: true, characterData: true })

    return () => {
      scrollEl.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
      observer.disconnect()
    }
  }, [scrollAreaRef, visibleThreads])

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
      const desired = entry.anchorTop
      const top = Math.max(desired, cursor)
      positioned.push({ ...entry, top })
      cursor = top + entry.height + CARD_GAP
    }

    if (activeCommentId) {
      const active = positioned.find((entry) => entry.thread.root.id === activeCommentId)
      if (active && active.top !== active.anchorTop) {
        const delta = active.anchorTop - active.top
        if (delta !== 0) {
          for (const entry of positioned) {
            entry.top = entry.top + delta
          }
          for (let i = 1; i < positioned.length; i++) {
            const prev = positioned[i - 1]
            const minTop = prev.top + prev.height + CARD_GAP
            if (positioned[i].top < minTop) positioned[i].top = minTop
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
          members={members}
          isExpanded={activeCommentId === entry.thread.root.id}
          onActivate={onSelectThread}
          onReply={onReply}
          onResolve={onResolve}
          onReopen={onReopen}
          onEdit={onEdit}
          onDelete={onDelete}
          onCopyLink={onCopyLink}
          readOnly={readOnly}
          position={entry.top}
          setMeasuredHeight={handleSetMeasuredHeight}
        />
      ))}
    </div>
  )
}
