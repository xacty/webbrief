import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase, INITIAL_AUTH_TYPE } from '../lib/supabase'
import { Button, Input, Card, Badge } from '../components/ui'
import styles from './AuthPage.module.css'

export default function SetPassword() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // Possible statuses:
  //   'loading'           — waiting for invite/reset token to land
  //   'ready'             — session active, form visible
  //   'expired'           — no session arrived (timeout)
  //   'recovery_invalid'  — session active but server says recovery row expired/used
  const [status, setStatus] = useState('loading')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [authType] = useState(INITIAL_AUTH_TYPE) // 'invite' | 'recovery' | null

  useEffect(() => {
    let active = true
    let expiredTimer = null

    async function runRecoveryCheck() {
      if (authType !== 'recovery') return
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const headers = new Headers({ 'Content-Type': 'application/json' })
        if (session?.access_token) {
          headers.set('Authorization', `Bearer ${session.access_token}`)
        }
        const response = await fetch('/api/auth/validate-reset-token', {
          method: 'POST',
          headers,
        })
        if (!response.ok) return // soft-fail: leave status as-is; user can still try
        const body = await response.json().catch(() => null)
        if (!active || !body) return
        if (body.valid === false) {
          setStatus('recovery_invalid')
        }
      } catch {
        // network failure → don't block the form
      }
    }

    // Listen for the SIGNED_IN event fired when Supabase processes the invite/reset
    // token from the URL hash (#access_token=…&type=invite|recovery)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        clearTimeout(expiredTimer)
        setStatus((current) => (current === 'recovery_invalid' ? current : 'ready'))
        runRecoveryCheck()
      }
    })

    // Also check for an already-active session (page refresh after partial flow)
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) {
        clearTimeout(expiredTimer)
        setStatus((current) => (current === 'recovery_invalid' ? current : 'ready'))
        runRecoveryCheck()
      }
    })

    // If no session arrives in 5 s, show the expired/invalid message
    expiredTimer = window.setTimeout(() => {
      if (!active) return
      setStatus((current) => (current === 'loading' ? 'expired' : current))
    }, 5000)

    return () => {
      active = false
      clearTimeout(expiredTimer)
      subscription.unsubscribe()
    }
  }, [authType])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setSubmitting(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError

      if (authType === 'recovery') {
        // Mark the password_reset_requests row used so subsequent visits via the
        // same link get 'used' instead of an open form. Best-effort: a failure
        // here doesn't block the user from continuing.
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const headers = new Headers({ 'Content-Type': 'application/json' })
          if (session?.access_token) {
            headers.set('Authorization', `Bearer ${session.access_token}`)
          }
          await fetch('/api/auth/mark-reset-used', { method: 'POST', headers })
        } catch {
          // swallow — best-effort
        }
      }

      // Get the fresh session explicitly — don't rely on context which may lag behind USER_UPDATED event
      const { data: sessionData } = await supabase.auth.getSession()
      await refreshUser(sessionData.session, { force: true })
      navigate('/companies')
    } catch (err) {
      setError(err.message || 'No se pudo guardar la contraseña')
    } finally {
      setSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className={styles.page}>
        <Card padding="lg" shadow="md" radius="lg" className={styles.card}>
          <h1 className={styles.title}>WeBrief</h1>
          <p className={styles.help}>Verificando enlace de invitación…</p>
        </Card>
      </div>
    )
  }

  if (status === 'recovery_invalid') {
    return (
      <div className={styles.page}>
        <Card padding="lg" shadow="md" radius="lg" className={styles.card}>
          <h1 className={styles.title}>WeBrief</h1>
          <div className={styles.subtitleRow}>
            <h2 className={styles.subtitle}>Enlace de restablecimiento no válido</h2>
            <Badge variant="danger">Expirado</Badge>
          </div>
          <p className={styles.help}>
            Este enlace de restablecimiento ya caducó o fue usado. Pedile al admin/manager
            que te envíe uno nuevo, o usá "Olvidé mi contraseña" desde la pantalla de login.
          </p>
          <Button type="button" variant="primary" fullWidth onClick={() => navigate('/login')}>
            Ir al inicio de sesión
          </Button>
        </Card>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className={styles.page}>
        <Card padding="lg" shadow="md" radius="lg" className={styles.card}>
          <h1 className={styles.title}>WeBrief</h1>
          <div className={styles.subtitleRow}>
            <h2 className={styles.subtitle}>Enlace no válido</h2>
            <Badge variant="danger">Expirado</Badge>
          </div>
          <p className={styles.help}>
            El enlace de invitación expiró o ya fue usado. Contacta a tu administrador para
            recibir una nueva invitación.
          </p>
          <Button type="button" variant="primary" fullWidth onClick={() => navigate('/login')}>
            Ir al inicio de sesión
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <Card padding="lg" shadow="md" radius="lg" className={styles.card}>
        <h1 className={styles.title}>WeBrief</h1>
        <h2 className={styles.subtitle}>Crea tu contraseña</h2>
        <p className={styles.help}>
          Elige una contraseña segura para acceder a WeBrief.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            id="new-password"
            label="Nueva contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <Input
            id="confirm-password"
            label="Confirmar contraseña"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" variant="primary" disabled={submitting} loading={submitting} fullWidth>
            {submitting ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
