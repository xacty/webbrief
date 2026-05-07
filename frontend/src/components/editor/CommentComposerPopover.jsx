import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Send, X } from 'lucide-react'
import styles from './CommentsUI.module.css'

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

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

function MentionsAutocomplete({ candidates, query, onSelect, anchorPoint }) {
  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return candidates.slice(0, 8)
    return candidates
      .filter((c) => {
        const name = (c.fullName || c.email || '').toLowerCase()
        return name.includes(q)
      })
      .slice(0, 8)
  }, [candidates, query])

  if (!filtered.length) return null

  const style = { left: anchorPoint.left, top: anchorPoint.top }
  return createPortal(
    <div className={styles.mentionsDropdown} style={style}>
      {filtered.map((profile) => {
        const name = profile.fullName || profile.email || 'Usuario'
        return (
          <button
            key={profile.id}
            type="button"
            className={styles.mentionItem}
            onMouseDown={(e) => { e.preventDefault(); onSelect(profile) }}
          >
            <span
              className={styles.mentionAvatar}
              style={profile.avatarUrl ? { backgroundImage: `url(${profile.avatarUrl})` } : undefined}
            >
              {profile.avatarUrl ? '' : getInitials(name)}
            </span>
            <span>{name}</span>
            {profile.email && <span className={styles.mentionEmail}>{profile.email}</span>}
          </button>
        )
      })}
    </div>,
    document.body,
  )
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
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef(null)

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
    const before = value.slice(0, cursor)
    const match = before.match(/(?:^|\s)@([\w.\-]*)$/)
    if (match) {
      setMentionQuery({ startIdx: cursor - match[1].length - 1, query: match[1] })
    } else {
      setMentionQuery(null)
    }
  }

  function handleMentionSelect(profile) {
    if (!mentionQuery || !textareaRef.current) return
    const ta = textareaRef.current
    const before = body.slice(0, mentionQuery.startIdx)
    const after = body.slice(ta.selectionStart || mentionQuery.startIdx)
    const insertion = `@${profile.fullName || profile.email || 'usuario'} `
    const next = before + insertion + after
    setBody(next)
    setMentionQuery(null)
    setMentionUserIds((prev) => (prev.includes(profile.id) ? prev : [...prev, profile.id]))
    window.requestAnimationFrame(() => {
      const cursor = (before + insertion).length
      ta.focus()
      ta.setSelectionRange(cursor, cursor)
    })
  }

  async function handleSubmit() {
    const trimmed = body.trim()
    if (!trimmed || submitting) return
    const presentMentions = mentionUserIds.filter((id) => {
      const profile = members.find((m) => m.id === id)
      const name = profile?.fullName || profile?.email
      if (!name) return false
      return body.includes(`@${name}`)
    })
    setSubmitting(true)
    try {
      await onSubmit({ body: trimmed, mentions: presentMentions })
    } finally {
      setSubmitting(false)
    }
  }

  function handleKey(event) {
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
          candidates={members}
          query={mentionQuery?.query || ''}
          onSelect={handleMentionSelect}
          anchorPoint={mentionsAnchor}
        />
      )}
    </div>,
    document.body,
  )
}
