import { useEffect, useRef, useState } from 'react'
import { Modal, Input, Button } from '../ui'
import styles from './RenameModal.module.css'

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Mirrors
 * NewFolderModal's subtitle/form/actions pattern.
 *
 * Genérico: sirve tanto para renombrar un asset (PATCH assets/:id
 * fileName) como una carpeta (PATCH folders/:id name). No conoce la API —
 * el caller decide qué endpoint llamar vía `onSubmit`, esta pieza sólo
 * posee el estado de UI (valor, busy, error).
 */
export default function RenameModal({
  open,
  onClose,
  title,
  label,
  initialValue = '',
  maxLength = 255,
  submitLabel = 'Guardar',
  onSubmit,
}) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setValue(initialValue || '')
    setError('')
    setBusy(false)
  }, [open, initialValue])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Escribe un nombre')
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit?.(trimmed)
      onClose?.()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el nombre')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} initialFocusRef={inputRef} closeOnEscape={!busy} closeOnBackdrop={!busy}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <Input
          ref={inputRef}
          label={label}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={maxLength}
          required
          error={error}
          disabled={busy}
        />
        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={busy}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
