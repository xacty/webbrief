import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, RotateCcw, X } from 'lucide-react'
import styles from './CommentsUI.module.css'
import marginStyles from './CommentMarginCards.module.css'
import { CommentEntry, ReplyComposer } from './CommentMarginCards'

const POPOVER_WIDTH = 320
const SAFE_GAP = 10
const VIEWPORT_MARGIN = 12

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

function findAnchorRect(editor, commentId) {
  if (!editor || !commentId) return null
  const span = editor.view.dom.querySelector(`span[data-comment-id="${CSS.escape(commentId)}"]`)
  if (!span) return null
  return span.getBoundingClientRect()
}

// CommentInlinePopover — popover flotante que muestra el thread sobre el editor
// cuando las cards laterales están ocultas (viewport angosto). Se posiciona
// arriba o abajo del rango anclado dependiendo del espacio disponible, sin
// taparlo. Re-mide en scroll y resize. Cierra con X o click fuera.
export default function CommentInlinePopover({
  editor,
  commentId,
  thread,
  profiles = [],
  members = [],
  currentUser,
  readOnly = false,
  onClose,
  onReply,
  onResolve,
  onReopen,
  onEdit,
  onDelete,
  onCopyLink,
}) {
  const popoverRef = useRef(null)
  const [pos, setPos] = useState(null)
  const [measuredHeight, setMeasuredHeight] = useState(260)
  const profilesById = useMemo(() => new Map((profiles || []).map((p) => [p.id, p])), [profiles])

  // Mide y posiciona el popover. Re-corre en scroll, resize, o cuando cambia
  // el thread. Prefiere abrir abajo del rango; si no hay espacio, abre arriba;
  // si tampoco, lo pega al bottom del viewport.
  useLayoutEffect(() => {
    if (!editor || !commentId) {
      setPos(null)
      return
    }
    const compute = () => {
      const anchorRect = findAnchorRect(editor, commentId)
      if (!anchorRect) {
        setPos(null)
        return
      }
      const popH = popoverRef.current?.getBoundingClientRect().height || measuredHeight || 260
      const spaceBelow = window.innerHeight - anchorRect.bottom - VIEWPORT_MARGIN
      const spaceAbove = anchorRect.top - VIEWPORT_MARGIN

      let top
      if (spaceBelow >= popH + SAFE_GAP) {
        top = anchorRect.bottom + SAFE_GAP
      } else if (spaceAbove >= popH + SAFE_GAP) {
        top = anchorRect.top - popH - SAFE_GAP
      } else {
        // No entra ni arriba ni abajo: pegamos al borde con más espacio.
        top = spaceBelow >= spaceAbove
          ? Math.max(VIEWPORT_MARGIN, window.innerHeight - popH - VIEWPORT_MARGIN)
          : VIEWPORT_MARGIN
      }

      // Centrar horizontalmente sobre el span, clampear al viewport
      let left = anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2
      left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - POPOVER_WIDTH - VIEWPORT_MARGIN))

      setPos({ top, left })
    }
    compute()
    const onScroll = () => compute()
    const onResize = () => compute()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    // ResizeObserver al doc del editor por si reflows internos
    const ro = editor.view.dom ? new ResizeObserver(compute) : null
    ro?.observe(editor.view.dom)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [editor, commentId, measuredHeight])

  // Click outside del popover cierra
  useEffect(() => {
    if (!commentId) return
    function handleDown(e) {
      if (popoverRef.current?.contains(e.target)) return
      // Si el click es en otro span con data-comment-id, dejamos que el handler
      // de selección de comentario haga lo suyo (cambiará commentId, no cerramos).
      if (e.target instanceof Element && e.target.closest('span[data-comment-id]')) return
      onClose?.()
    }
    function handleEsc(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [commentId, onClose])

  // Mide la altura propia del popover para reposicionarse de forma precisa
  useLayoutEffect(() => {
    if (!popoverRef.current) return
    const h = popoverRef.current.getBoundingClientRect().height
    if (h && Math.abs(h - measuredHeight) > 4) setMeasuredHeight(h)
  })

  if (!editor || !commentId || !thread || !pos) return null

  const root = thread.root
  const isResolved = Boolean(root.resolvedAt)
  const isAdmin = currentUser?.platformRole === 'admin'

  const resolveTrailing = !readOnly
    ? (isResolved ? (
        <button
          type="button"
          className={marginStyles.iconChip}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onReopen?.(root.id) }}
          aria-label="Reabrir"
          data-wb-tooltip="Reabrir"
        >
          <RotateCcw size={14} />
        </button>
      ) : (
        <button
          type="button"
          className={marginStyles.iconChip}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); onResolve?.(root.id) }}
          aria-label="Resolver"
          data-wb-tooltip="Resolver"
        >
          <CheckCircle2 size={14} />
        </button>
      ))
    : null

  return createPortal(
    <div
      ref={popoverRef}
      className={cx(marginStyles.card, marginStyles.cardActive, marginStyles.inlinePopover)}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width: POPOVER_WIDTH }}
    >
      <button
        type="button"
        className={marginStyles.popoverCloseBtn}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => { e.stopPropagation(); onClose?.() }}
        aria-label="Cerrar"
      >
        <X size={14} />
      </button>

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

      {thread.replies.map((reply) => (
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

      {!readOnly && (
        <ReplyComposer
          onSubmit={(body, mentions) => onReply?.(root.id, body, mentions)}
          currentUser={currentUser}
          members={members}
          disabled={isResolved}
        />
      )}
    </div>,
    document.body,
  )
}
