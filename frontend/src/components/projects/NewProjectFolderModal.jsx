import { useEffect, useId, useRef, useState } from 'react'
import { Modal, Input, Button } from '../ui'
import { createProjectFolder } from '../../lib/projectFoldersApi'
import styles from './NewProjectFolderModal.module.css'

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Mirrors
 * library/NewFolderModal.jsx (mismo patrón subtitle/form/actions), adaptado
 * a project_folders (Ola 2, O2.c).
 */
export default function NewProjectFolderModal({ open, onClose, companyId, parentFolderId, onCreated }) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const descId = useId()

  useEffect(() => {
    if (!open) return
    setName('')
    setError('')
    setBusy(false)
  }, [open])

  async function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Escribe un nombre para la carpeta')
      return
    }
    if (!companyId) return
    setBusy(true)
    setError('')
    try {
      const result = await createProjectFolder(companyId, { name: trimmed, parentFolderId: parentFolderId || null })
      onCreated?.(result.folder)
      onClose?.()
    } catch (err) {
      setError(err.message || 'No se pudo crear la carpeta')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva carpeta" ariaDescribedBy={descId} initialFocusRef={inputRef}>
      <p id={descId} className={styles.subtitle}>
        Organiza tus proyectos agrupándolos en carpetas.
      </p>
      <form className={styles.form} onSubmit={handleSubmit}>
        <Input
          ref={inputRef}
          label="Nombre de la carpeta"
          value={name}
          onChange={(event) => setName(event.target.value)}
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
            Crear carpeta
          </Button>
        </div>
      </form>
    </Modal>
  )
}
