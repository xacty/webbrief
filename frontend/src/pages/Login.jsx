// Pantalla de inicio de sesión del diseñador
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { Button, Input, Card } from '../components/ui'
import styles from './AuthPage.module.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { signIn } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setFeedback('')
    setSubmitting(true)

    try {
      await signIn(email, password)
      // Honor a same-origin return_to (used by the OAuth consent flow). Only
      // allow relative paths to /oauth/authorize to avoid open-redirect.
      const returnTo = searchParams.get('return_to')
      if (returnTo && returnTo.startsWith('/oauth/authorize')) {
        navigate(returnTo)
      } else {
        navigate('/dashboard')
      }
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión')
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePasswordReset(e) {
    e.preventDefault()
    setError('')
    setFeedback('')
    setSubmitting(true)

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/set-password`,
      })

      if (resetError) throw resetError

      setFeedback('Si el email existe, recibirás un enlace para crear una nueva contraseña.')
    } catch (err) {
      setError(err.message || 'No se pudo enviar el enlace de recuperación')
    } finally {
      setSubmitting(false)
    }
  }

  function toggleResetMode() {
    setResetMode((current) => !current)
    setError('')
    setFeedback('')
  }

  return (
    <div className={styles.page}>
      <Card padding="lg" shadow="md" radius="lg" className={styles.card}>
        <h1 className={styles.title}>WeBrief</h1>
        <h2 className={styles.subtitle}>
          {resetMode ? 'Restablecer contraseña' : 'Iniciar sesión'}
        </h2>
        <p className={styles.help}>
          {resetMode
            ? 'Ingresa tu email y te enviaremos un enlace para definir una nueva contraseña.'
            : 'Entra con un usuario activo para administrar empresas, proyectos y accesos.'}
        </p>

        <form className={styles.form} onSubmit={resetMode ? handlePasswordReset : handleSubmit}>
          <Input
            id="login-email"
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          {!resetMode && (
            <Input
              id="login-password"
              label="Contraseña"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          )}

          {error && <p className={styles.error}>{error}</p>}
          {feedback && <p className={styles.success}>{feedback}</p>}

          <Button type="submit" variant="primary" disabled={submitting} loading={submitting} fullWidth>
            {submitting
              ? (resetMode ? 'Enviando...' : 'Ingresando...')
              : (resetMode ? 'Enviar enlace' : 'Iniciar sesión')}
          </Button>

          <Button type="button" variant="ghost" onClick={toggleResetMode} fullWidth>
            {resetMode ? 'Volver al login' : 'Olvidé mi contraseña'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
