import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, ShieldAlert } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { Button, Card, Badge, Select, Input, Modal } from '../components/ui'
import styles from './SecurityErrorsPage.module.css'

const LEVEL_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'error', label: 'error' },
  { value: 'warn', label: 'warn' },
]

const SOURCE_OPTIONS = [
  { value: '', label: 'Todos' },
  { value: 'supabase_auth', label: 'supabase_auth' },
  { value: 'route', label: 'route' },
  { value: 'external_api', label: 'external_api' },
  { value: 'unhandled', label: 'unhandled' },
  { value: 'email', label: 'email' },
]

const DAY_OPTIONS = [
  { value: 1, label: 'Último día' },
  { value: 7, label: 'Últimos 7' },
  { value: 30, label: 'Últimos 30' },
  { value: 90, label: 'Últimos 90' },
]

function formatDate(iso) {
  if (!iso) return 'Sin registro'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export default function SecurityErrorsPage() {
  const navigate = useNavigate()
  const [errors, setErrors] = useState([])
  const [warnings, setWarnings] = useState([])
  const [loading, setLoading] = useState(true)
  const [feedback, setFeedback] = useState('')
  const [days, setDays] = useState(7)
  const [level, setLevel] = useState('')
  const [source, setSource] = useState('')
  const [search, setSearch] = useState('')
  const [selectedError, setSelectedError] = useState(null)
  const [errorDetail, setErrorDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)

  async function fetchErrors() {
    setLoading(true)
    setFeedback('')
    try {
      const params = new URLSearchParams({
        days: String(days),
        limit: '100',
      })
      if (level) params.set('level', level)
      if (source) params.set('source', source)
      if (search.trim()) params.set('search', search.trim())

      const data = await apiFetch(`/api/security/errors?${params.toString()}`)
      setErrors(data?.errors || [])
      setWarnings(data?.warnings || [])
    } catch (err) {
      setFeedback(`No se pudieron cargar errores: ${err.message || err}`)
      setErrors([])
      setWarnings([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchErrors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, level, source])

  async function openDetail(errorId) {
    setSelectedError(errorId)
    setErrorDetail(null)
    setDetailLoading(true)
    try {
      const data = await apiFetch(`/api/security/errors/${errorId}`)
      setErrorDetail(data?.error || null)
    } catch (err) {
      setFeedback(`No se pudo cargar el detalle: ${err.message || err}`)
    } finally {
      setDetailLoading(false)
    }
  }

  function closeDetail() {
    setSelectedError(null)
    setErrorDetail(null)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Admin · Seguridad</p>
          <h1 className={styles.title}>Errores técnicos</h1>
          <p className={styles.subtitle}>
            Errores no manejados, fallos de Supabase Auth y errores de APIs externas. Para eventos
            de seguridad (logins, bloqueos, intentos denegados), ver la pestaña Eventos en
            <Link to="/security" className={styles.inlineLink}> Seguridad</Link>.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="secondary"
            size="md"
            icon={<ArrowLeft size={16} />}
            type="button"
            onClick={() => navigate('/security')}
          >
            Volver a Seguridad
          </Button>
          <Button
            variant="secondary"
            size="md"
            icon={<RefreshCw size={16} />}
            type="button"
            onClick={fetchErrors}
            disabled={loading}
          >
            Actualizar
          </Button>
        </div>
      </header>

      {warnings.length > 0 && (
        <section className={styles.warningBox}>
          <ShieldAlert size={18} aria-hidden="true" />
          <div>
            <strong>Atención</strong>
            {warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        </section>
      )}

      {feedback && <p className={styles.error}>{feedback}</p>}

      <form
        className={styles.filters}
        onSubmit={(event) => {
          event.preventDefault()
          fetchErrors()
        }}
      >
        <Select label="Rango" value={String(days)} onChange={(event) => setDays(Number(event.target.value))}>
          {DAY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select label="Nivel" value={level} onChange={(event) => setLevel(event.target.value)}>
          {LEVEL_OPTIONS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select label="Origen" value={source} onChange={(event) => setSource(event.target.value)}>
          {SOURCE_OPTIONS.map((option) => (
            <option key={option.value || 'all'} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Input
          label="Buscar mensaje"
          type="text"
          placeholder="texto en mensaje..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <Button type="submit" variant="primary" size="md" disabled={loading}>
          Aplicar
        </Button>
      </form>

      {loading ? (
        <p className={styles.loading}>Cargando...</p>
      ) : errors.length === 0 ? (
        <Card padding="lg" radius="md" className={styles.empty}>
          <p>Sin errores en los últimos {days} día(s). Todo bien.</p>
        </Card>
      ) : (
        <Card as="section" padding="md" radius="lg" shadow="sm" className={styles.tableCard}>
          <div className={styles.tableSurface}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Nivel</th>
                  <th>Origen</th>
                  <th>Ruta</th>
                  <th>Código</th>
                  <th>Mensaje</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err) => (
                  <tr
                    key={err.id}
                    className={styles.row}
                    onClick={() => openDetail(err.id)}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        openDetail(err.id)
                      }
                    }}
                  >
                    <td className={styles.timestamp}>{formatDate(err.created_at)}</td>
                    <td>
                      <Badge variant={err.level === 'error' ? 'danger' : 'warning'} size="sm">
                        {err.level}
                      </Badge>
                    </td>
                    <td className={styles.mono}>{err.source}</td>
                    <td className={styles.mono}>
                      {[err.method, err.route].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className={styles.mono}>{err.error_code || '—'}</td>
                    <td className={styles.message}>{err.error_message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(selectedError)}
        onClose={closeDetail}
        title="Detalle del error"
        size="lg"
      >
        {detailLoading || !errorDetail ? (
          <p className={styles.loading}>Cargando...</p>
        ) : (
          <div className={styles.detail}>
            <dl>
              <dt>ID</dt>
              <dd className={styles.mono}>{errorDetail.id}</dd>
              <dt>Cuándo</dt>
              <dd>{formatDate(errorDetail.created_at)}</dd>
              <dt>Nivel</dt>
              <dd>
                <Badge variant={errorDetail.level === 'error' ? 'danger' : 'warning'} size="sm">
                  {errorDetail.level}
                </Badge>
              </dd>
              <dt>Origen</dt>
              <dd className={styles.mono}>{errorDetail.source}</dd>
              <dt>Request ID</dt>
              <dd className={styles.mono}>{errorDetail.request_id || '—'}</dd>
              <dt>Ruta</dt>
              <dd className={styles.mono}>
                {[errorDetail.method, errorDetail.route].filter(Boolean).join(' ') || '—'}
              </dd>
              <dt>User ID</dt>
              <dd className={styles.mono}>{errorDetail.user_id || '—'}</dd>
              <dt>Código</dt>
              <dd className={styles.mono}>{errorDetail.error_code || '—'}</dd>
            </dl>

            <h3>Mensaje</h3>
            <pre className={styles.pre}>{errorDetail.error_message}</pre>

            {errorDetail.metadata && Object.keys(errorDetail.metadata).length > 0 && (
              <>
                <h3>Metadata</h3>
                <pre className={styles.pre}>{JSON.stringify(errorDetail.metadata, null, 2)}</pre>
              </>
            )}

            {errorDetail.stack_trace && (
              <>
                <h3>Stack trace</h3>
                <pre className={styles.pre}>{errorDetail.stack_trace}</pre>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
