// Pantalla de inicio de sesión del diseñador
import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './AuthPage.module.css'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()
  const { signIn } = useAuth()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setFeedback('')
    setSubmitting(true)

    try {
      await signIn(email, password)
      navigate('/dashboard')
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

      setFeedback('Si el email existe, Supabase enviará un enlace para crear una nueva contraseña.')
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
      <div className={styles.card}>
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
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-email">Email</label>
            <input
              id="login-email"
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {!resetMode && (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="login-password">Contraseña</label>
              <div className={styles.passwordWrap}>
                <input
                  id="login-password"
                  className={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.eyeBtn}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}
          {feedback && <p className={styles.success}>{feedback}</p>}

          <button className={styles.button} type="submit" disabled={submitting}>
            {submitting
              ? (resetMode ? 'Enviando...' : 'Ingresando...')
              : (resetMode ? 'Enviar enlace' : 'Iniciar sesión')}
          </button>

          <button className={styles.textButton} type="button" onClick={toggleResetMode}>
            {resetMode ? 'Volver al login' : 'Olvidé mi contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
