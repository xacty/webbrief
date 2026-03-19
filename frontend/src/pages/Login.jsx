// Pantalla de inicio de sesión del diseñador
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al iniciar sesión')
        return
      }

      // Guardar el token en localStorage para mantener la sesión
      localStorage.setItem('token', data.token)
      navigate('/dashboard')
    } catch {
      setError('No se pudo conectar con el servidor')
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: '100px auto', padding: '0 16px' }}>
      <h1 style={{ marginBottom: 24 }}>WebBrief</h1>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label>Email</label>
          <br />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label>Contraseña</label>
          <br />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ width: '100%', padding: 8, marginTop: 4, boxSizing: 'border-box' }}
          />
        </div>

        {/* Mostrar error si las credenciales son incorrectas */}
        {error && <p style={{ color: 'red', marginBottom: 12 }}>{error}</p>}

        <button type="submit" style={{ width: '100%', padding: 10 }}>
          Iniciar sesión
        </button>
      </form>
    </div>
  )
}
