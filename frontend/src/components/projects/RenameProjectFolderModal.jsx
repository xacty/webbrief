import { useEffect, useRef, useState } from 'react'
import { Modal, Input, Button } from '../ui'
import { updateProjectFolder } from '../../lib/projectFoldersApi'
import styles from './RenameProjectFolderModal.module.css'

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Mirrors
 * library/RenameModal.jsx, pero acotado a carpetas de proyecto
 * únicamente (a diferencia de la biblioteca, esta ola no ofrece renombrar
 * un proyecto individual desde acá — sólo carpetas), así que no hace falta
 * la genericidad kind:'asset'|'folder' del original.
 */
export default function RenameProjectFolderModal({ open, onClose, companyId, folder, onRenamed }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setValue(folder?.name || '')
    setError('')
    setBusy(false)
  }, [open, folder])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Escribe un nombre')
      return
    }
    if (!companyId || !folder) return
    setBusy(true)
    setError('')
    try {
      const result = await updateProjectFolder(companyId, folder.id, { name: trimmed })
      onRenamed?.(result.folder)
      onClose?.()
    } catch (err) {
      setError(err.message || 'No se pudo guardar el nombre')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Renombrar carpeta" initialFocusRef={inputRef} closeOnEscape={!busy} closeOnBackdrop={!busy}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <Input
          ref={inputRef}
          label="Nombre de la carpeta"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          maxLength={80}
          required
          error={error}
          disabled={busy}
        />
        <div className={styles.actions}>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={busy}>
            Guardar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
