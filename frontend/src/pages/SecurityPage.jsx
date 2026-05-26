import { useEffect, useMemo, useState } from 'react'
import { Ban, ShieldAlert, ShieldCheck } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { Button, Input, Select, Modal, Card, Badge } from '../components/ui'
import SecurityShell from '../components/SecurityShell'
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

// TEMP demo dataset for visual preview. Used only when the API returns
// nothing (e.g. fresh dev DB). Bloquear/Desbloquear on demo rows show an
// alert instead of hitting the API.
const DEMO_SECURITY = {
  overview: {
    events24h: 247,
    logins24h: 38,
    failures24h: 6,
    activeBlocks: 2,
    uniqueIps7d: 17,
    criticalEvents24h: 1,
  },
  topIps: [],
  recentCriticalEvents: [],
  users: [
    { userId: 'demo-u-1', email: 'ana.martinez@empresa.com',  lastLoginAt: '2026-05-20T08:42:00Z', ips: ['190.55.12.84'],                 failureCount: 0, block: null, _demo: true },
    { userId: 'demo-u-2', email: 'juan.lopez@empresa.com',    lastLoginAt: '2026-05-20T07:15:00Z', ips: ['181.45.92.10', '181.45.92.11'], failureCount: 2, block: null, _demo: true },
    { userId: 'demo-u-3', email: 'pedro.sanchez@empresa.com', lastLoginAt: '2026-05-19T22:08:00Z', ips: ['190.55.12.84'],                 failureCount: 0, block: null, _demo: true },
    { userId: 'demo-u-4', email: 'sofia.r@externos.com',      lastLoginAt: '2026-05-18T11:30:00Z', ips: ['200.118.45.7'],                 failureCount: 5, block: { id: 'demo-b-1', type: 'manual' }, _demo: true },
  ],
  ips: [
    { ipAddress: '190.55.12.84',  eventCount: 142, failureCount: 0,  users: [{ email: 'ana.martinez@empresa.com' }, { email: 'pedro.sanchez@empresa.com' }], lastSeenAt: '2026-05-20T08:42:00Z', block: null, _demo: true },
    { ipAddress: '181.45.92.10',  eventCount: 67,  failureCount: 2,  users: [{ email: 'juan.lopez@empresa.com' }],                                            lastSeenAt: '2026-05-20T07:15:00Z', block: null, _demo: true },
    { ipAddress: '200.118.45.7',  eventCount: 38,  failureCount: 12, users: [{ email: 'sofia.r@externos.com' }],                                              lastSeenAt: '2026-05-18T11:30:00Z', block: { id: 'demo-b-2', type: 'manual' }, _demo: true },
    { ipAddress: '34.218.7.221',  eventCount: 15,  failureCount: 15, users: [],                                                                                lastSeenAt: '2026-05-17T19:20:00Z', block: { id: 'demo-b-3', type: 'rate_limit' }, _demo: true },
  ],
  events: [
    { id: 'demo-e-1', source: 'webrief',       action: 'login',                outcome: 'success', actorEmail: 'ana.martinez@empresa.com', ipAddress: '190.55.12.84', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/124', createdAt: '2026-05-20T08:42:00Z' },
    { id: 'demo-e-2', source: 'webrief',       action: 'login',                outcome: 'success', actorEmail: 'juan.lopez@empresa.com',   ipAddress: '181.45.92.10', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Firefox/125',          createdAt: '2026-05-20T07:15:00Z' },
    { id: 'demo-e-3', source: 'webrief',       action: 'invite_sent',          outcome: 'success', actorEmail: 'admin@webrief.app',        ipAddress: '190.55.12.84', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/124', createdAt: '2026-05-20T06:50:00Z' },
    { id: 'demo-e-4', source: 'supabase_auth', action: 'login',                outcome: 'failure', actorEmail: 'sofia.r@externos.com',     ipAddress: '200.118.45.7', userAgent: 'curl/8.4.0',                                          createdAt: '2026-05-19T23:11:00Z' },
    { id: 'demo-e-5', source: 'webrief',       action: 'blocked_login',        outcome: 'failure', actorEmail: 'sofia.r@externos.com',     ipAddress: '200.118.45.7', userAgent: 'curl/8.4.0',                                          createdAt: '2026-05-19T23:05:00Z' },
    { id: 'demo-e-6', source: 'webrief',       action: 'password_changed',     outcome: 'success', actorEmail: 'pedro.sanchez@empresa.com',ipAddress: '190.55.12.84', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4) Safari/605',createdAt: '2026-05-19T18:22:00Z' },
    { id: 'demo-e-7', source: 'webrief',       action: 'rate_limit_triggered', outcome: 'failure', actorEmail: null,                       ipAddress: '34.218.7.221', userAgent: 'python-requests/2.31',                                createdAt: '2026-05-17T19:20:00Z' },
  ],
  warnings: ['Mostrando datos de muestra para preview visual'],
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

  const isEmpty = !data.overview && data.users.length === 0 && data.events.length === 0
  const displayData = !loading && isEmpty ? DEMO_SECURITY : data

  const warnings = useMemo(() => [...new Set(displayData.warnings)], [displayData.warnings])

  function openBlockModal(payload) {
    setBlockModal(payload)
    setBlockReason('')
    setBlockExpiresAt('')
  }

  function closeBlockModal() {
    setBlockModal(null)
  }

  async function submitBlock(event) {
    event.preventDefault()
    if (!blockModal || !blockReason.trim()) return
    if (typeof blockModal.userId === 'string' && blockModal.userId.startsWith('demo-')) {
      window.alert('Demo: este sujeto es de muestra. Bloquear funciona cuando hay datos reales.')
      setBlockModal(null)
      return
    }
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
    if (typeof blockId === 'string' && blockId.startsWith('demo-')) {
      window.alert('Demo: este bloqueo es de muestra. Desbloquear funciona cuando hay datos reales.')
      return
    }
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

  const overview = displayData.overview || {}

  return (
    <div className={styles.page}>
      <SecurityShell
        title="Seguridad"
        meta="Revisa actividad de autenticación, IPs asociadas, señales de abuso y bloqueos activos. El bloqueo IP aplica al backend de WeBrief; Supabase Auth directo requiere hardening separado."
        onRefresh={loadSecurity}
        refreshing={loading}
      />

      <div className={styles.pageBody}>

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
        <Select
          label="Rango"
          value={days}
          onChange={(event) => setDays(event.target.value)}
        >
          {DATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        <Select
          label="Resultado"
          value={outcome}
          onChange={(event) => setOutcome(event.target.value)}
        >
          {OUTCOME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        <Input
          label="Acción"
          value={actionFilter}
          onChange={(event) => setActionFilter(event.target.value)}
          placeholder="login, blocked, invalid..."
        />
      </section>

      <section className={styles.gridTwo}>
        <Panel title="Usuarios" meta={`${displayData.users.length} usuarios con actividad`}>
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
                {displayData.users.slice(0, 12).map((user) => (
                  <tr key={user.userId || user.email}>
                    <td>{user.email || user.userId || 'Usuario sin email'}</td>
                    <td>{formatDate(user.lastLoginAt)}</td>
                    <td>{user.ips?.join(', ') || 'Sin IP'}</td>
                    <td>{user.failureCount || 0}</td>
                    <td>{user.block ? <Badge variant="danger" size="sm">Bloqueado</Badge> : <Badge variant="success" size="sm">Activo</Badge>}</td>
                    <td>
                      {user.block ? (
                        <Button variant="ghost" size="sm" onClick={() => revokeBlock(user.block.id)} disabled={busy === `revoke:${user.block.id}`}>
                          Desbloquear
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => openBlockModal({ blockType: 'user', userId: user.userId, label: user.email })} disabled={!user.userId}>
                          Bloquear
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="IPs" meta={`${displayData.ips.length} IPs observadas`}>
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
                {displayData.ips.slice(0, 12).map((ip) => (
                  <tr key={ip.ipAddress}>
                    <td>{ip.ipAddress}</td>
                    <td>{ip.eventCount} · {ip.failureCount} fallos</td>
                    <td>{ip.users?.map((user) => user.email || user.userId).filter(Boolean).join(', ') || 'Sin usuario'}</td>
                    <td>{formatDate(ip.lastSeenAt)}</td>
                    <td>{ip.block ? <Badge variant="danger" size="sm">Bloqueada</Badge> : <Badge variant="success" size="sm">Activa</Badge>}</td>
                    <td>
                      {ip.block ? (
                        <Button variant="ghost" size="sm" onClick={() => revokeBlock(ip.block.id)} disabled={busy === `revoke:${ip.block.id}`}>
                          Desbloquear
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => openBlockModal({ blockType: 'ip', ipAddress: ip.ipAddress, label: ip.ipAddress })}>
                          Bloquear
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </section>

      <Panel title="Eventos" meta={`${displayData.events.length} eventos en este filtro`}>
        <div className={styles.eventList}>
          {displayData.events.map((event) => (
            <article className={styles.eventItem} key={`${event.source}:${event.id}`}>
              <div className={styles.eventIcon}>
                {event.outcome === 'success' ? <ShieldCheck size={18} /> : <Ban size={18} />}
              </div>
              <div>
                <div className={styles.eventTitle}>
                  <strong>{event.action}</strong>
                  <Badge variant={event.outcome === 'success' ? 'success' : 'danger'} size="sm">{outcomeLabel(event.outcome)}</Badge>
                  <Badge variant="neutral" size="sm">{sourceLabel(event.source)}</Badge>
                </div>
                <p className={styles.eventMeta}>
                  {formatDate(event.createdAt)} · {event.actorEmail || event.actorUserId || event.ipAddress || 'Sin actor'} · {event.ipAddress || 'Sin IP'}
                </p>
                <p className={styles.eventMeta}>{formatUserAgent(event.userAgent)}</p>
              </div>
            </article>
          ))}
          {!loading && displayData.events.length === 0 && <p className={styles.empty}>No hay eventos para este filtro.</p>}
        </div>
      </Panel>
      </div>

      <Modal
        open={Boolean(blockModal)}
        onClose={closeBlockModal}
        title={blockModal?.blockType === 'ip' ? 'Bloquear IP' : 'Bloquear usuario'}
        size="md"
      >
        {blockModal && (
          <form className={styles.modalForm} onSubmit={submitBlock}>
            <p>Destino: <strong>{blockModal.label || blockModal.ipAddress || blockModal.userId}</strong></p>
            <label className={styles.fieldGroup}>
              <span className={styles.fieldLabel}>Razón</span>
              <textarea
                className={styles.textarea}
                value={blockReason}
                onChange={(event) => setBlockReason(event.target.value)}
                required
              />
            </label>
            <Input
              label="Expira en"
              type="datetime-local"
              value={blockExpiresAt}
              onChange={(event) => setBlockExpiresAt(event.target.value)}
            />
            <div className={styles.modalActions}>
              <Button type="button" variant="secondary" onClick={closeBlockModal}>Cancelar</Button>
              <Button type="submit" variant="danger" disabled={busy === 'block' || !blockReason.trim()} loading={busy === 'block'}>
                Bloquear
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

function KpiCard({ label, value, tone = 'normal' }) {
  return (
    <Card padding="md" shadow="sm" radius="md" className={`${styles.kpiCard} ${tone === 'danger' ? styles.kpiDanger : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  )
}

function Panel({ title, meta, children }) {
  return (
    <Card as="section" padding="md" shadow="sm" radius="lg" className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <h2 className={styles.panelTitle}>{title}</h2>
          {meta && <p className={styles.panelMeta}>{meta}</p>}
        </div>
      </div>
      {children}
    </Card>
  )
}
