import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import styles from './CommentsUI.module.css'

function getInitials(name) {
  if (!name) return '?'
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || '').join('') || '?'
}

// Detecta si el cursor está dentro de un token @... y devuelve la query.
// Devuelve null si no hay mención activa en este punto.
export function detectMentionQuery(text, cursor) {
  if (typeof text !== 'string' || typeof cursor !== 'number') return null
  const before = text.slice(0, cursor)
  const match = before.match(/(?:^|\s)@([\w.\-]*)$/)
  if (!match) return null
  return { startIdx: cursor - match[1].length - 1, query: match[1] }
}

// Inserta una mención en el texto reemplazando el token @query parcial.
// Devuelve { next: string, cursor: number } o null si no aplica.
export function insertMention({ text, mentionQuery, profile, textareaSelectionStart }) {
  if (!mentionQuery) return null
  const before = text.slice(0, mentionQuery.startIdx)
  const after = text.slice(textareaSelectionStart || mentionQuery.startIdx)
  const insertion = `@${profile.fullName || profile.email || 'usuario'} `
  const next = before + insertion + after
  const cursor = (before + insertion).length
  return { next, cursor }
}

// Filtra los IDs de mentions a los nombres que sigan presentes en el body.
// Útil al submit: si el usuario borró el "@Nombre" del texto, no lo notificamos.
export function filterMentionsByBody(mentionUserIds, body, members) {
  return (mentionUserIds || []).filter((id) => {
    const profile = members.find((m) => m.id === id)
    const name = profile?.fullName || profile?.email
    if (!name) return false
    return body.includes(`@${name}`)
  })
}

export default function MentionsAutocomplete({ candidates, query, onSelect, anchorPoint }) {
  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase()
    if (!q) return (candidates || []).slice(0, 8)
    return (candidates || [])
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
