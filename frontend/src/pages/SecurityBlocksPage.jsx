import { useCallback, useEffect, useState } from 'react'
import { ShieldOff, AlertTriangle } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { supabase } from '../lib/supabase'
import { Button, Card, Badge } from '../components/ui'
import SecurityShell from '../components/SecurityShell'
import styles from './SecurityBlocksPage.module.css'

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function blockTypeLabel(type) {
  return type === 'rate_limit' ? 'Rate-limit' : 'Manual'
}

function blockTypeVariant(type) {
  return type === 'rate_limit' ? 'warning' : 'danger'
}

// TEMP demo blocks for visual preview. Revocar muestra un alert en lugar
// de pegarle al backend porque los IDs son fake.
const DEMO_BLOCKS = {
  manualBlocks: [
    { id: 'demo-mb-1', type: 'manual', subject: 'sofia.r@externos.com', reason: 'Múltiples intentos de login fallidos desde IPs sospechosas', since: '2026-05-19T23:11:00Z', expiresAt: '2026-05-26T23:11:00Z', _demo: true },
    { id: 'demo-mb-2', type: 'manual', subject: '200.118.45.7',         reason: 'IP marcada por escaneo automatizado',                       since: '2026-05-18T11:30:00Z', expiresAt: null,                       _demo: true },
  ],
  rateLimitBlocks: [
    { type: 'rate_limit', subject: '34.218.7.221', limiter: 'login',         violations: 4, lastBlockedAt: '2026-05-17T19:20:00Z', blockMs: 900000,  currentlyBlocked: true,  _demo: true },
    { type: 'rate_limit', subject: '54.93.180.22', limiter: 'inviteUser',    violations: 2, lastBlockedAt: '2026-05-19T14:05:00Z', blockMs: 1800000, currentlyBlocked: false, _demo: true },
    { type: 'rate_limit', subject: '181.45.92.10', limiter: 'passwordReset', violations: 1, lastBlockedAt: '2026-05-20T07:00:00Z', blockMs: 600000,  currentlyBlocked: false, _demo: true },
  ],
  warnings: [],
}

export default function SecurityBlocksPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [data, setData] = useState({ manualBlocks: [], rateLimitBlocks: [], warnings: [] })
  const [busyKey, setBusyKey] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const result = await apiFetch('/api/security/blocks')
      setData({
        manualBlocks: result.manualBlocks || [],
        rateLimitBlocks: result.rateLimitBlocks || [],
        warnings: result.warnings || [],
      })
    } catch (err) {
      setError(err.message || 'No se pudo cargar bloqueos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleRevokeRateLimit(key) {
    // Real data not loaded yet → assume demo and bail.
    if (data.rateLimitBlocks.length === 0) {
      window.alert('Demo: este bloqueo es de muestra. Limpiar funciona cuando hay datos reales.')
      return
    }
    if (!window.confirm(`¿Limpiar bloqueo rate-limit\n${key}?`)) return

    setBusyKey(`revoke:${key}`)
    setActionMessage('')
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (session?.access_token) {
        headers.set('Authorization', `Bearer ${session.access_token}`)
      }
      const response = await fetch('/api/security/rate-limits/clear', {
        method: 'POST',
        headers,
        body: JSON.stringify({ key }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error || 'No se pudo limpiar el bloqueo')
        return
      }
      const memTag = body.memoryCleared ? 'memoria' : ''
      const persistTag = body.persistentCleared ? 'persistente' : ''
      const tags = [memTag, persistTag].filter(Boolean).join(' + ') || 'sin cambios'
      setActionMessage(`Bloqueo limpiado (${tags})`)
      await load()
    } catch (err) {
      setError(err.message || 'Error de red al limpiar bloqueo')
    } finally {
      setBusyKey('')
    }
  }

  async function handleRevokeManual(id) {
    if (typeof id === 'string' && id.startsWith('demo-')) {
      window.alert('Demo: este bloqueo es de muestra. Revocar funciona cuando hay datos reales.')
      return
    }
    if (!window.confirm('¿Revocar este bloqueo manual?')) return

    setBusyKey(`revoke-manual:${id}`)
    setActionMessage('')
    setError('')
    try {
      await apiFetch(`/api/security/blocks/${id}`, { method: 'DELETE' })
      setActionMessage('Bloqueo manual revocado')
      await load()
    } catch (err) {
      setError(err.message || 'No se pudo revocar el bloqueo manual')
    } finally {
      setBusyKey('')
    }
  }

  const isEmpty = data.manualBlocks.length === 0 && data.rateLimitBlocks.length === 0
  const displayData = !loading && isEmpty ? DEMO_BLOCKS : data
  const totalActive = displayData.manualBlocks.length + displayData.rateLimitBlocks.filter((b) => b.currentlyBlocked).length

  return (
    <div className={styles.page}>
      <SecurityShell
        title="Bloqueos activos"
        meta={`${totalActive} actualmente bloqueado${totalActive === 1 ? '' : 's'} · ${displayData.manualBlocks.length} manual${displayData.manualBlocks.length === 1 ? '' : 'es'}, ${displayData.rateLimitBlocks.length} rate-limit (últimas 24h)`}
        onRefresh={load}
        refreshing={loading}
      />

      <div className={styles.pageBody}>

      {actionMessage && <p className={styles.success}>{actionMessage}</p>}
      {error && <p className={styles.error}>{error}</p>}
      {displayData.warnings.length > 0 && (
        <div className={styles.warningBanner}>
          <AlertTriangle size={16} />
          <span>{displayData.warnings.join(' · ')}</span>
        </div>
      )}

      {loading && <p className={styles.info}>Cargando bloqueos…</p>}

      {!loading && displayData.manualBlocks.length === 0 && displayData.rateLimitBlocks.length === 0 && (
        <Card padding="lg" shadow="sm" radius="lg">
          <p className={styles.empty}>Sin bloqueos activos en las últimas 24 horas. Todo bien.</p>
        </Card>
      )}

      {!loading && (displayData.manualBlocks.length > 0 || displayData.rateLimitBlocks.length > 0) && (
        <Card padding="lg" shadow="sm" radius="lg">
          <table className={styles.blocksTable}>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Sujeto</th>
                <th>Motivo</th>
                <th>Desde / Último</th>
                <th>Expira</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {displayData.manualBlocks.map((block) => (
                <tr key={`m-${block.id}`}>
                  <td><Badge variant={blockTypeVariant(block.type)} size="sm">{blockTypeLabel(block.type)}</Badge></td>
                  <td><code className={styles.subject}>{block.subject}</code></td>
                  <td>{block.reason || '—'}</td>
                  <td>{formatDate(block.since)}</td>
                  <td>{formatDate(block.expiresAt)}</td>
                  <td><Badge variant="danger" size="sm">Activo</Badge></td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<ShieldOff size={14} />}
                      onClick={() => handleRevokeManual(block.id)}
                      disabled={busyKey === `revoke-manual:${block.id}`}
                      loading={busyKey === `revoke-manual:${block.id}`}
                      title="Revocar bloqueo manual"
                    >
                      Revocar
                    </Button>
                  </td>
                </tr>
              ))}

              {displayData.rateLimitBlocks.map((block) => (
                <tr key={`rl-${block.subject}`}>
                  <td><Badge variant={blockTypeVariant(block.type)} size="sm">{blockTypeLabel(block.type)}</Badge></td>
                  <td><code className={styles.subject}>{block.subject}</code></td>
                  <td>{block.limiter}{block.violations > 1 ? ` · ${block.violations} violaciones` : ''}</td>
                  <td>{formatDate(block.lastBlockedAt)}</td>
                  <td>{block.blockMs ? `${Math.round(block.blockMs / 60000)} min ventana` : '—'}</td>
                  <td>
                    {block.currentlyBlocked
                      ? <Badge variant="danger" size="sm">Activo</Badge>
                      : <Badge variant="neutral" size="sm">Histórico</Badge>}
                  </td>
                  <td>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      icon={<ShieldOff size={14} />}
                      onClick={() => handleRevokeRateLimit(block.subject)}
                      disabled={busyKey === `revoke:${block.subject}`}
                      loading={busyKey === `revoke:${block.subject}`}
                      title="Limpiar el bucket de este rate limit"
                    >
                      Revocar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      </div>
    </div>
  )
}
