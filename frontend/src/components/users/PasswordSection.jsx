import { useState } from 'react'
import { KeyRound, RefreshCw, Copy as CopyIcon, Check } from 'lucide-react'
import { Button, Input } from '../ui'
import { apiFetch } from '../../lib/api'
import styles from './PasswordSection.module.css'

/**
 * Props:
 *   targetUser: { id, fullName, email, ... }
 *   selectedSessionIdsToRevoke: string[]  — managed by parent SessionsList; passed through
 *   onChanged: (result) => void  — called after successful set-password (with { mode, revokedCount })
 */
export default function PasswordSection({ targetUser, selectedSessionIdsToRevoke = [], onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generatedPassword, setGeneratedPassword] = useState('')
  const [copied, setCopied] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customPassword, setCustomPassword] = useState('')
  const [customConfirm, setCustomConfirm] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  if (!targetUser?.id) return null

  async function callSetPassword(payload) {
    setBusy(true)
    setError('')
    setSuccessMessage('')
    try {
      const result = await apiFetch(`/api/users/${targetUser.id}/set-password`, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      return result
    } finally {
      setBusy(false)
    }
  }

  async function handleGenerate() {
    setGeneratedPassword('')
    setCopied(false)
    try {
      const confirmed = window.confirm(
        'Esto cerrará las sesiones seleccionadas e invalidará cualquier link de reset previo. ¿Continuar?'
      )
      if (!confirmed) return
      const result = await callSetPassword({ mode: 'generate', revokeSessionIds: selectedSessionIdsToRevoke })
      setGeneratedPassword(result.password)
      onChanged?.({ mode: 'generate', revokedCount: result.revokedCount })
    } catch (err) {
      setError(err?.message || 'No se pudo generar la contraseña')
    }
  }

  async function handleCustomSubmit(e) {
    e.preventDefault()
    if (customPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres')
      return
    }
    if (customPassword !== customConfirm) {
      setError('Las contraseñas no coinciden')
      return
    }
    try {
      const result = await callSetPassword({
        mode: 'custom',
        password: customPassword,
        revokeSessionIds: selectedSessionIdsToRevoke,
      })
      onChanged?.({ mode: 'custom', revokedCount: result.revokedCount })
      setCustomPassword('')
      setCustomConfirm('')
      setShowCustom(false)
      setSuccessMessage(`Contraseña actualizada${result.revokedCount > 0 ? ` (${result.revokedCount} sesiones cerradas)` : ''}`)
    } catch (err) {
      setError(err?.message || 'No se pudo actualizar la contraseña')
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(generatedPassword)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (_err) {
      // fallback: select-and-prompt
      window.prompt('Copiá manualmente la contraseña:', generatedPassword)
    }
  }

  return (
    <div className={styles.section}>
      <p className={styles.label}>Contraseña</p>
      <p className={styles.sectionHint}>
        {generatedPassword
          ? 'Copiala antes de cerrar — no se vuelve a mostrar.'
          : 'Generá una contraseña segura o definí una manualmente. Si marcaste sesiones arriba, se cerrarán al guardar.'}
      </p>

      {generatedPassword ? (
        <div className={styles.generatedBox}>
          <p className={styles.generatedHeader}>Contraseña generada</p>
          <div className={styles.generatedRow}>
            <code className={styles.generatedCode}>{generatedPassword}</code>
            <Button
              type="button"
              variant={copied ? 'secondary' : 'primary'}
              size="sm"
              icon={copied ? <Check size={14} /> : <CopyIcon size={14} />}
              onClick={handleCopy}
            >
              {copied ? 'Copiada' : 'Copiar'}
            </Button>
          </div>
          <div className={styles.generatedDoneRow}>
            <Button type="button" variant="ghost" size="sm" onClick={() => setGeneratedPassword('')}>
              Listo, ya la copié
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button
            type="button"
            variant="primary"
            icon={<RefreshCw size={16} />}
            onClick={handleGenerate}
            disabled={busy}
            loading={busy}
          >
            Generar contraseña aleatoria
          </Button>
          <span className={styles.separator}>o</span>
          <Button
            type="button"
            variant="ghost"
            icon={<KeyRound size={16} />}
            onClick={() => setShowCustom((v) => !v)}
            disabled={busy}
          >
            {showCustom ? 'Cancelar' : 'Establecer contraseña manual'}
          </Button>
        </div>
      )}

      {showCustom && !generatedPassword && (
        <form onSubmit={handleCustomSubmit} className={styles.customForm}>
          <Input
            label="Nueva contraseña"
            type="password"
            value={customPassword}
            onChange={(e) => setCustomPassword(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <Input
            label="Repetir contraseña"
            type="password"
            value={customConfirm}
            onChange={(e) => setCustomConfirm(e.target.value)}
            autoComplete="new-password"
            minLength={8}
            required
          />
          <div className={styles.customSubmitRow}>
            <Button type="submit" variant="primary" disabled={busy} loading={busy}>
              Guardar contraseña
            </Button>
          </div>
        </form>
      )}

      {error && <p className={styles.error}>{error}</p>}
      {successMessage && <p className={styles.success}>{successMessage}</p>}
    </div>
  )
}
