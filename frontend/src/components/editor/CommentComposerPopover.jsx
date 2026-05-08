import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Send } from 'lucide-react'
import styles from './CommentsUI.module.css'
import MentionsAutocomplete, {
  detectMentionQuery,
  filterMembers,
  filterMentionsByBody,
  insertMention,
} from './MentionsAutocomplete'

const POPOVER_WIDTH = 320
const POPOVER_OFFSET_Y = 8

function clampToViewport(left, top) {
  const margin = 12
  const maxLeft = window.innerWidth - POPOVER_WIDTH - margin
  const maxTop = window.innerHeight - 200 - margin
  return {
    left: Math.max(margin, Math.min(left, maxLeft)),
    top: Math.max(margin, Math.min(top, maxTop)),
  }
}

export default function CommentComposerPopover({
  open,
  anchorRect,
  anchorSnippet = '',
  initialBody = '',
  initialMentions = [],
  members = [],
  onCancel,
  onSubmit,
  submitLabel = 'Comentar',
}) {
  const [body, setBody] = useState(initialBody)
  const [mentionUserIds, setMentionUserIds] = useState(initialMentions)
  const [mentionQuery, setMentionQuery] = useState(null) // { startIdx, query }
  const [mentionIndex, setMentionIndex] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef(null)

  const mentionItems = useMemo(
    () => filterMembers(members, mentionQuery?.query || ''),
    [members, mentionQuery?.query],
  )

  useEffect(() => { setMentionIndex(0) }, [mentionQuery?.query])

  useEffect(() => {
    if (open) {
      setBody(initialBody)
      setMentionUserIds(initialMentions)
      setMentionQuery(null)
      const id = window.setTimeout(() => textareaRef.current?.focus(), 30)
      return () => window.clearTimeout(id)
    }
  }, [open, initialBody, initialMentions])

  const position = useMemo(() => {
    if (!anchorRect) return null
    return clampToViewport(anchorRect.left, anchorRect.bottom + POPOVER_OFFSET_Y)
  }, [anchorRect])

  if (!open || !position) return null

  function handleChange(event) {
    const value = event.target.value
    setBody(value)
    const cursor = event.target.selectionStart || 0
    setMentionQuery(detectMentionQuery(value, cursor))
  }

  function handleMentionSelect(profile) {
    if (!mentionQuery || !textareaRef.current) return
    const ta = textareaRef.current
    const result = insertMention({
      text: body,
      mentionQuery,
      profile,
      textareaSelectionStart: ta.selectionStart || mentionQuery.startIdx,
    })
    if (!result) return
    setBody(result.next)
    setMentionQuery(null)
    setMentionUserIds((prev) => (prev.includes(profile.id) ? prev : [...prev, profile.id]))
    window.requestAnimationFrame(() => {
      ta.focus()
      ta.setSelectionRange(result.cursor, result.cursor)
    })
  }

  async function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    const presentMentions = filterMentionsByBody(mentionUserIds, body, members)
    setSubmitting(true)
    try {
      await onSubmit({ body: trimmed, mentions: presentMentions })
    } finally {
      setSubmitting(false)
    }
  }

  function handleKey(event) {
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
      onCancel?.()
      return
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      handleSubmit()
    }
  }

  const mentionsAnchor = mentionQuery && textareaRef.current
    ? (() => {
        const rect = textareaRef.current.getBoundingClientRect()
        return { left: rect.left + 12, top: rect.bottom + 4 }
      })()
    : null

  const containerStyle = {
    left: position.left,
    top: position.top,
    width: POPOVER_WIDTH,
  }

  return createPortal(
    <div className={styles.composer} style={containerStyle} onMouseDown={(e) => e.stopPropagation()}>
      {anchorSnippet && (
        <div className={styles.composerSnippet}>“{anchorSnippet}”</div>
      )}
      <textarea
        ref={textareaRef}
        className={styles.composerTextarea}
        placeholder="Escribe un comentario… (@menciona miembros)"
        value={body}
        onChange={handleChange}
        onKeyDown={handleKey}
      />
      <div className={styles.composerActions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>Cancelar</button>
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!body.trim() || submitting}
        >
          <Send size={12} /> {submitLabel}
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
    </div>,
    document.body,
  )
}
