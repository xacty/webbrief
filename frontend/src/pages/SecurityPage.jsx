import { useEffect, useMemo, useState } from 'react'
import { Ban, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import { apiFetch } from '../lib/api'
import styles from './SecurityPage.module.css'

const DATE_OPTIONS = [
  { value: '1', label: '24 horas' },
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
]

const OUTCOME_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'success', label: 'Correctos' },
  { value: 'denied', label: 'Denegados' },
  { value: 'failed', label: 'Fallidos' },
]

function formatDate(value) {
  if (!value) return 'Sin registro'
  return new Date(value).toLocaleString('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatUserAgent(value = '') {
  if (!value) return 'Sin user agent'
  return value.length > 72 ? `${value.slice(0, 72)}...` : value
}

function outcomeLabel(outcome) {
  if (outcome === 'success') return 'Correcto'
  if (outcome === 'denied') return 'Denegado'
  if (outcome === 'failed') return 'Fallido'
  return outcome || 'Evento'
}

function sourceLabel(source) {
  return source === 'supabase_auth' ? 'Supabase Auth' : 'WeBrief'
}

const emptyData = {
  overview: null,
  topIps: [],
  recentCriticalEvents: [],
  users: [],
  ips: [],
  events: [],
  warnings: [],
}

export default function SecurityPage() {
  const [days, setDays] = useState('7')
  const [outcome, setOutcome] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [data, setData] = useState(emptyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [blockModal, setBlockModal] = useState(null)
  const [blockReason, setBlockReason] = useState('')
  const [blockExpiresAt, setBlockExpiresAt] = useState('')

  async function loadSecurity() {
    try {
      setLoading(true)
      const query = `days=${encodeURIComponent(days)}`
      const eventQuery = `${query}&outcome=${encodeURIComponent(outcome)}&action=${encodeURIComponent(actionFilter)}&limit=80`
      const [overviewData, usersData, ipsData, eventsData] = await Promise.all([
        apiFetch(`/api/security/overview?${query}`),
        apiFetch(`/api/security/users?${query}`),
        apiFetch(`/api/security/ips?${query}`),
        apiFetch(`/api/security/events?${eventQuery}`),
      ])

      setData({
        overview: overviewData.overview,
        topIps: overviewData.topIps || [],
        recentCriticalEvents: overviewData.recentCriticalEvents || [],
        users: usersData.users || [],
        ips: ipsData.ips || [],
        events: eventsData.events || [],
        warnings: [
          ...(overviewData.warnings || []),
          ...(usersData.warnings || []),
          ...(ipsData.warnings || []),
          ...(eventsData.warnings || []),
        ].filter(Boolean),
      })
      setError('')
    } catch (err) {
      setError(err.message || 'No se pudo cargar seguridad')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSecurity()
  }, [days, outcome, actionFilter])

  const warnings = useMemo(() => [...new Set(data.warnings)], [data.warnings])

  function openBlockModal(payload) {
    setBlockModal(payload)
    setBlockReason('')
    setBlockExpiresAt('')
  }

  async function submitBlock(event) {
    event.preventDefault()
    if (!blockModal || !blockReason.trim()) return
    setBusy('block')
    try {
      await apiFetch('/api/security/blocks', {
        method: 'POST',
        body: JSON.stringify({
          blockType: blockModal.blockType,
          userId: blockModal.userId || null,
          ipAddress: blockModal.ipAddress || null,
          reason: blockReason.trim(),
          expiresAt: blockExpiresAt ? new Date(blockExpiresAt).toISOString() : null,
        }),
      })
      setBlockModal(null)
      await loadSecurity()
    } catch (err) {
      setError(err.message || 'No se pudo crear el bloqueo')
    } finally {
      setBusy('')
    }
  }

  async function revokeBlock(blockId) {
    if (!blockId) return
    setBusy(`revoke:${blockId}`)
    try {
      await apiFetch(`/api/security/blocks/${blockId}`, { method: 'DELETE' })
      await loadSecurity()
    } catch (err) {
      setError(err.message || 'No se pudo revocar el bloqueo')
    } finally {
      setBusy('')
    }
  }

  const overview = data.overview || {}

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin</p>
          <h1 className={styles.title}>Seguridad</h1>
          <p className={styles.subtitle}>
            Revisa actividad de autenticación, IPs asociadas, señales de abuso y bloqueos activos.
            El bloqueo IP aplica al backend de WeBrief; Supabase Auth directo requiere hardening separado.
          </p>
        </div>
        <button className={styles.secondaryButton} type="button" onClick={loadSecurity} disabled={loading}>
          <RefreshCw size={16} />
          Actualizar
        </button>
      </header>

      {warnings.length > 0 && (
        <section className={styles.warningBox}>
          <ShieldAlert size={18} />
          <div>
            <strong>Fuente parcial de datos</strong>
            {warnings.map((warning) => <p key={warning}>{warning}</p>)}
          </div>
        </section>
      )}

      {error && <p className={styles.error}>{error}</p>}

      <section className={styles.kpiGrid}>
        <KpiCard label="Eventos 24h" value={overview.events24h || 0} />
        <KpiCard label="Logins 24h" value={overview.logins24h || 0} />
        <KpiCard label="Fallos 24h" value={overview.failures24h || 0} tone={overview.failures24h > 0 ? 'danger' : 'normal'} />
        <KpiCard label="Bloqueos activos" value={overview.activeBlocks || 0} tone={overview.activeBlocks > 0 ? 'danger' : 'normal'} />
        <KpiCard label="IPs únicas 7d" value={overview.uniqueIps7d || 0} />
        <KpiCard label="Críticos 24h" value={overview.criticalEvents24h || 0} tone={overview.criticalEvents24h > 0 ? 'danger' : 'normal'} />
      </section>

      <section className={styles.filters}>
        <label>
          Rango
          <select value={days} onChange={(event) => setDays(event.target.value)}>
            {DATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Resultado
          <select value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            {OUTCOME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label>
          Acción
          <input value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} placeholder="login, blocked, invalid..." />
        </label>
      </section>

      <section className={styles.gridTwo}>
        <Panel title="Usuarios" meta={`${data.users.length} usuarios con actividad`}>
          <div className={styles.tableSurface}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Último login</th>
                  <th>IPs</th>
                  <th>Fallos</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {data.users.slice(0, 12).map((user) => (
                  <tr key={user.userId || user.email}>
                    <td>{user.email || user.userId || 'Usuario sin email'}</td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>{user.ips?.join(', ') || 'Sin IP'}</td>
                    <td>{user.failureCount || 0}</td>
                    <td>{user.block ? <span className={styles.badgeDanger}>Bloqueado</span> : <span className={styles.badgeOk}>Activo</span>}</td>
                    <td>
                      {user.block ? (
                        <button className={styles.textButton} onClick={() => revokeBlock(user.block.id)} disabled={busy === `revoke:${user.block.id}`}>
                          Desbloquear
                        </button>
                      ) : (
                        <button className={styles.textButton} onClick={() => openBlockModal({ blockType: 'user', userId: user.userId, label: user.email })} disabled={!user.userId}>
                          Bloquear
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="IPs" meta={`${data.ips.length} IPs observadas`}>
          <div className={styles.tableSurface}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>IP</th>
                  <th>Eventos</th>
                  <th>Usuarios</th>
                  <th>Última vez</th>
                  <th>Estado</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {data.ips.slice(0, 12).map((ip) => (
                  <tr key={ip.ipAddress}>
                    <td>{ip.ipAddress}</td>
                    <td>{ip.eventCount} · {ip.failureCount} fallos</td>
                    <td>{ip.users?.map((user) => user.email || user.userId).filter(Boolean).join(', ') || 'Sin usuario'}</td>
                    <td>{formatDate(ip.lastSeenAt)}</td>
                    <td>{ip.block ? <span className={styles.badgeDanger}>Bloqueada</span> : <span className={styles.badgeOk}>Activa</span>}</td>
                    <td>
                      {ip.block ? (
                        <button className={styles.textButton} onClick={() => revokeBlock(ip.block.id)} disabled={busy === `revoke:${ip.block.id}`}>
                          Desbloquear
                        </button>
                      ) : (
                        <button className={styles.textButton} onClick={() => openBlockModal({ blockType: 'ip', ipAddress: ip.ipAddress, label: ip.ipAddress })}>
                          Bloquear
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <Panel title="Eventos" meta={`${data.events.length} eventos en este filtro`}>
        <div className={styles.eventList}>
          {data.events.map((event) => (
            <article className={styles.eventItem} key={`${event.source}:${event.id}`}>
              <div className={styles.eventIcon}>
                {event.outcome === 'success' ? <ShieldCheck size={18} /> : <Ban size={18} />}
              </div>
              <div>
                <div className={styles.eventTitle}>
                  <strong>{event.action}</strong>
                  <span className={event.outcome === 'success' ? styles.badgeOk : styles.badgeDanger}>{outcomeLabel(event.outcome)}</span>
                  <span className={styles.sourceBadge}>{sourceLabel(event.source)}</span>
                </div>
                <p className={styles.eventMeta}>
                  {formatDate(event.createdAt)} · {event.actorEmail || event.actorUserId || event.ipAddress || 'Sin actor'} · {event.ipAddress || 'Sin IP'}
                </p>
                <p className={styles.eventMeta}>{formatUserAgent(event.userAgent)}</p>
              </div>
            </article>
          ))}
          {!loading && data.events.length === 0 && <p className={styles.empty}>No hay eventos para este filtro.</p>}
        </div>
      </Panel>

      {blockModal && (
        <div className={styles.modalBackdrop}>
          <form className={styles.modal} onSubmit={submitBlock}>
            <h2>{blockModal.blockType === 'ip' ? 'Bloquear IP' : 'Bloquear usuario'}</h2>
            <p>Destino: <strong>{blockModal.label || blockModal.ipAddress || blockModal.userId}</strong></p>
            <label>
              Razón
              <textarea value={blockReason} onChange={(event) => setBlockReason(event.target.value)} required />
            </label>
            <label>
              Expira en
              <input type="datetime-local" value={blockExpiresAt} onChange={(event) => setBlockExpiresAt(event.target.value)} />
            </label>
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={() => setBlockModal(null)}>Cancelar</button>
              <button type="submit" className={styles.dangerButton} disabled={busy === 'block' || !blockReason.trim()}>Bloquear</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function KpiCard({ label, value, tone = 'normal' }) {
  return (
    <div className={`${styles.kpiCard} ${tone === 'danger' ? styles.kpiDanger : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Panel({ title, meta, children }) {
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          {meta && <p className={styles.panelMeta}>{meta}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}
