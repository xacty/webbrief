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
 */
export default function PresenceAvatars({ peers = [], pages = [] }) {
  if (!peers.length) return null

  const hasOverflow = peers.length > MAX_VISIBLE
  // Con overflow, dejamos 2 avatares reales + 1 chip "+N" agrupando el resto.
  const visible = hasOverflow ? peers.slice(0, MAX_VISIBLE - 1) : peers
  const overflowCount = peers.length - visible.length

  function renderAvatar(peer, index) {
    const name = peer.name || 'Alguien'
    const page = pages.find((p) => p.id === peer.pageId)
    const title = page ? `${name} — ${page.name}` : name
    const swatch = hashToSwatch(peer.sessionId || name)

    return (
      <span
        key={peer.sessionId || index}
        className={`${styles.avatar} ${styles[`swatch${swatch}`]}`}
        title={title}
      >
        {peer.avatarUrl ? (
          <img src={peer.avatarUrl} alt={name} className={styles.avatarImg} />
        ) : (
          getInitials(name)
        )}
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
