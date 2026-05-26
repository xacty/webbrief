import { useEffect, useState } from 'react'
import { RefreshCw, Eye, EyeOff, LogOut } from 'lucide-react'
import { Button } from '../ui'
import { apiFetch } from '../../lib/api'
import { formatRelativeTime } from '../../lib/userAgent'
import styles from './SessionsList.module.css'

/**
 * Props:
 *   targetUserId: string
 *   selectedIds: Set<string>
 *   onSelectionChange: (Set<string>) => void
 *   onRevoked: () => void  — called after standalone revoke (refresh-list)
 */
export default function SessionsList({ targetUserId, selectedIds, onSelectionChange, onRevoked }) {
  const [sessions, setSessions] = useState([])
  const [canRevealIp, setCanRevealIp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [revealedIps, setRevealedIps] = useState({}) // sessionId → ipFull
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    if (!targetUserId) return
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetUserId])

  async function loadSessions() {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch(`/api/users/${targetUserId}/sessions`, { method: 'GET' })
      setSessions(data.sessions || [])
      setCanRevealIp(Boolean(data.canRevealIp))
      setRevealedIps({}) // reset reveals on refresh
    } catch (err) {
      setError(err?.message || 'No se pudieron cargar las sesiones')
    } finally {
      setLoading(false)
    }
  }

  function toggleSelected(id) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  function toggleAll() {
    if (sessions.length === 0) return
    const allSelected = sessions.every((s) => selectedIds.has(s.id))
    onSelectionChange(allSelected ? new Set() : new Set(sessions.map((s) => s.id)))
  }

  async function handleRevealIp(sessionId) {
    if (revealedIps[sessionId]) {
      // toggle off (front-end only, no API)
      setRevealedIps((prev) => {
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
      return
    }
    try {
      const data = await apiFetch(`/api/users/${targetUserId}/sessions/${sessionId}/reveal-ip`, { method: 'POST' })
      setRevealedIps((prev) => ({ ...prev, [sessionId]: data.ipFull || '(no registrada)' }))
    } catch (err) {
      setError(err?.message || 'No se pudo revelar la IP')
    }
  }

  async function handleRevokeSelected() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setRevoking(true)
    setError('')
    try {
      const data = await apiFetch(`/api/users/${targetUserId}/sessions/revoke`, {
        method: 'POST',
        body: JSON.stringify({ sessionIds: ids }),
      })
      onSelectionChange(new Set())
      onRevoked?.(data.revokedCount)
      await loadSessions()
    } catch (err) {
      setError(err?.message || 'No se pudieron revocar las sesiones')
    } finally {
      setRevoking(false)
    }
  }

  if (loading) {
    return <p className={styles.placeholder}>Cargando sesiones…</p>
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.section}>
        <div className={styles.header}>
          <p className={styles.label}>Sesiones activas (0)</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={<RefreshCw size={14} />}
            onClick={loadSessions}
            aria-label="Recargar sesiones"
          />
        </div>
        <p className={styles.placeholder}>Sin sesiones activas.</p>
      </div>
    )
  }

  const allSelected = sessions.every((s) => selectedIds.has(s.id))
  const someSelected = sessions.some((s) => selectedIds.has(s.id))

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <p className={styles.label}>Sesiones activas ({sessions.length})</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={<RefreshCw size={14} />}
          onClick={loadSessions}
          title="Recargar"
          aria-label="Recargar sesiones"
        />
      </div>
      {/* Section hint — moved out of the footer so the toggle/close row
          stays a stable 2-column layout regardless of selection state. */}
      <p className={styles.sectionHint}>
        {someSelected
          ? 'Las marcadas se cerrarán al guardar contraseña.'
          : 'Marcá sesiones para cerrarlas al guardar contraseña.'}
      </p>
      <div className={styles.list}>
        {sessions.map((s) => {
          const revealed = revealedIps[s.id]
          const ipDisplay = revealed || s.ipMasked
          return (
            <label key={s.id} className={styles.row}>
              <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelected(s.id)} />
              <span className={styles.device}>{s.deviceLabel}</span>
              <span className={styles.ip}>
                {ipDisplay}
                {canRevealIp && s.ipMasked && (
                  <button
                    type="button"
                    className={styles.eyeButton}
                    onClick={() => handleRevealIp(s.id)}
                    title={revealed ? 'Ocultar IP' : 'Revelar IP completa'}
                    aria-label={revealed ? 'Ocultar IP' : 'Revelar IP completa'}
                  >
                    {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                )}
              </span>
              <span className={styles.time}>{formatRelativeTime(s.lastRefreshAt)}</span>
            </label>
          )
        })}
      </div>
      <div className={styles.footer}>
        <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
          {allSelected ? 'Deseleccionar todas' : 'Seleccionar todas'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<LogOut size={14} />}
          onClick={handleRevokeSelected}
          disabled={!someSelected || revoking}
          loading={revoking}
        >
          {someSelected ? `Cerrar seleccionadas (${selectedIds.size})` : 'Cerrar seleccionadas'}
        </Button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}
