// frontend/src/pages/OAuthConsentPage.jsx
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import { Button, Card } from '../components/ui'
import styles from './OAuthConsentPage.module.css'

/**
 * OAuthConsentPage — consent screen for OAuth 2.1 authorization requests.
 * Reads OAuth query params, validates via /oauth/authorize/preview, displays
 * client + scopes, on approve POSTs /oauth/authorize/grant and navigates to
 * the resulting redirect URL.
 *
 * If user is not logged in, redirects to /login?return_to=<current URL>.
 */
export default function OAuthConsentPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()
  const [state, setState] = useState({ phase: 'loading', error: null, data: null, busy: false })

  // Redirect to login if needed.
  useEffect(() => {
    if (authLoading) return
    if (!isAuthenticated) {
      const returnTo = encodeURIComponent(location.pathname + location.search)
      navigate(`/login?return_to=${returnTo}`, { replace: true })
    }
  }, [authLoading, isAuthenticated, location, navigate])

  // Load preview once authenticated.
  useEffect(() => {
    if (authLoading || !isAuthenticated) return
    const query = location.search.startsWith('?') ? location.search.slice(1) : location.search
    apiFetch(`/oauth/authorize/preview?${query}`)
      .then((data) => {
        if (data.ok) {
          setState({ phase: 'ready', error: null, data, busy: false })
        } else {
          setState({ phase: 'error', error: (data.errors || ['Solicitud invalida']).join(', '), data: null, busy: false })
        }
      })
      .catch((err) => {
        setState({ phase: 'error', error: err.message || 'No se pudo cargar la solicitud', data: null, busy: false })
      })
  }, [authLoading, isAuthenticated, location.search])

  function parseQuery() {
    const query = location.search.startsWith('?') ? location.search.slice(1) : location.search
    const obj = {}
    new URLSearchParams(query).forEach((value, key) => { obj[key] = value })
    return obj
  }

  async function handleDecision(approve) {
    setState((s) => ({ ...s, busy: true }))
    try {
      const result = await apiFetch('/oauth/authorize/grant', {
        method: 'POST',
        body: JSON.stringify({ approve, query: parseQuery() }),
      })
      if (result.redirect_to) {
        window.location.href = result.redirect_to
      } else {
        setState((s) => ({ ...s, busy: false, error: 'Respuesta invalida del servidor' }))
      }
    } catch (err) {
      setState((s) => ({ ...s, busy: false, error: err.message || 'No se pudo procesar la solicitud' }))
    }
  }

  if (authLoading || state.phase === 'loading') {
    return <div className={styles.page}><p className={styles.loading}>Cargando...</p></div>
  }

  if (state.phase === 'error') {
    return (
      <div className={styles.page}>
        <Card className={styles.card} padding="lg" radius="lg" shadow="md">
          <h1 className={styles.title}>Solicitud invalida</h1>
          <p className={styles.error}>{state.error}</p>
          <Button variant="secondary" onClick={() => navigate('/integrations')}>Volver a Integraciones</Button>
        </Card>
      </div>
    )
  }

  const { client_name, redirect_uri_host, scope } = state.data

  return (
    <div className={styles.page}>
      <Card className={styles.card} padding="lg" radius="lg" shadow="md">
        <h1 className={styles.title}>Autorizar acceso</h1>
        <p className={styles.lead}>
          <strong>{client_name}</strong> quiere acceder a tu cuenta de WeBrief.
        </p>
        <div className={styles.detailBlock}>
          <p className={styles.detailLabel}>Te redirigira a:</p>
          <p className={styles.detailValue}>{redirect_uri_host}</p>
        </div>
        <div className={styles.detailBlock}>
          <p className={styles.detailLabel}>Permisos solicitados:</p>
          <ul className={styles.scopeList}>
            <li>Acceso completo a tu cuenta WeBrief (crear, leer y editar proyectos, paginas y briefs en tu nombre)</li>
          </ul>
        </div>
        {state.error && <p className={styles.error}>{state.error}</p>}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => handleDecision(false)} disabled={state.busy}>
            Denegar
          </Button>
          <Button variant="primary" onClick={() => handleDecision(true)} disabled={state.busy}>
            {state.busy ? 'Procesando...' : 'Autorizar'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
