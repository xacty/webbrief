import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './AuthPage.module.css'

export default function SetPassword() {
  const navigate = useNavigate()
  const { refreshUser } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  // 'loading' → waiting for invite token | 'ready' → session active | 'expired' → no session after timeout
  const [status, setStatus] = useState('loading')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let expiredTimer = null

    // Listen for the SIGNED_IN event fired when Supabase processes the invite/reset
    // token from the URL hash (#access_token=…&type=invite)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return
      if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session) {
        clearTimeout(expiredTimer)
        setStatus('ready')
      }
    })

    // Also check for an already-active session (page refresh after partial flow)
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      if (data.session) {
        clearTimeout(expiredTimer)
        setStatus('ready')
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
  }, [])

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

      await refreshUser()
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
        <div className={styles.card}>
          <h1 className={styles.title}>WeBrief</h1>
          <p className={styles.help}>Verificando enlace de invitación…</p>
        </div>
      </div>
    )
  }

  if (status === 'expired') {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h1 className={styles.title}>WeBrief</h1>
          <h2 className={styles.subtitle}>Enlace no válido</h2>
          <p className={styles.help}>
            El enlace de invitación expiró o ya fue usado. Contacta a tu administrador para
            recibir una nueva invitación.
          </p>
          <a href="/login" className={styles.button} style={{ display: 'block', textAlign: 'center' }}>
            Ir al inicio de sesión
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1 className={styles.title}>WeBrief</h1>
        <h2 className={styles.subtitle}>Crea tu contraseña</h2>
        <p className={styles.help}>
          Elige una contraseña segura para acceder a WeBrief.
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="new-password">Nueva contraseña</label>
            <input
              id="new-password"
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="confirm-password">Confirmar contraseña</label>
            <input
              id="confirm-password"
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
