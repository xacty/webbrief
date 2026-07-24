import { useState } from 'react'
import styles from './PresenceAvatars.module.css'

const SWATCH_COUNT = 3
const MAX_VISIBLE = 3

function hashToSwatch(key) {
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return hash % SWATCH_COUNT
}

function getInitials(name) {
  const trimmed = (name || '').trim()
  if (!trimmed) return '?'
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

/**
 * PresenceAvatars — muestra hasta 3 avatares circulares de colaboradores
 * conectados al canal de presencia del proyecto (ver `lib/editorPresence.js`).
 * Dedupe por sessionId (ya viene único desde el canal). Si hay más de 3
 * peers, el último círculo colapsa en "+N".
 *
 * `onPeerClick` es opcional: si se pasa, cada avatar (excepto el chip "+N")
 * se renderiza como botón accesible que navega a la página/sección donde
 * está ese colaborador — ver `jumpToPeer` en ProjectEditor.jsx.
 */
export default function PresenceAvatars({ peers = [], pages = [], onPeerClick = null }) {
  // Sessions cuyo avatarUrl falló al cargar (404, CORS, etc.) — se cae a
  // iniciales en vez de mostrar el glyph de imagen rota del navegador.
  const [failedAvatars, setFailedAvatars] = useState(() => new Set())

  if (!peers.length) return null

  const hasOverflow = peers.length > MAX_VISIBLE
  // Con overflow, dejamos 2 avatares reales + 1 chip "+N" agrupando el resto.
  const visible = hasOverflow ? peers.slice(0, MAX_VISIBLE - 1) : peers
  const overflowCount = peers.length - visible.length

  function renderAvatar(peer, index) {
    const name = peer.name || 'Alguien'
    const page = pages.find((p) => p.id === peer.pageId)
    const clickable = Boolean(onPeerClick) && Boolean(peer.pageId)
    const title = page
      ? `${name} — ${page.name}${clickable ? '. Clic para ir' : ''}`
      : name
    const swatch = hashToSwatch(peer.sessionId || name)
    const showImage = Boolean(peer.avatarUrl) && !failedAvatars.has(peer.sessionId)
    const avatarClassName = `${styles.avatar} ${styles[`swatch${swatch}`]}`

    const content = showImage ? (
      <img
        src={peer.avatarUrl}
        alt={name}
        className={styles.avatarImg}
        onError={() => {
          setFailedAvatars((prev) => (
            prev.has(peer.sessionId) ? prev : new Set(prev).add(peer.sessionId)
          ))
        }}
      />
    ) : (
      getInitials(name)
    )

    if (clickable) {
      return (
        <button
          key={peer.sessionId || index}
          type="button"
          className={`${avatarClassName} ${styles.avatarButton}`}
          title={title}
          aria-label={`Ir a donde está ${name}`}
          onClick={() => onPeerClick(peer)}
        >
          {content}
        </button>
      )
    }

    return (
      <span
        key={peer.sessionId || index}
        className={avatarClassName}
        title={title}
      >
        {content}
      </span>
    )
  }

  return (
    <div className={styles.root} aria-label="Personas conectadas en este proyecto">
      {visible.map(renderAvatar)}
      {overflowCount > 0 && (
        <span
          className={`${styles.avatar} ${styles.avatarOverflow}`}
          title={`${overflowCount} persona${overflowCount === 1 ? '' : 's'} más`}
        >
          +{overflowCount}
        </span>
      )}
    </div>
  )
}
