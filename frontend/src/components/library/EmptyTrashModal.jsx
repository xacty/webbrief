import { useEffect, useId, useState } from 'react'
import { Modal, Button } from '../ui'
import { emptyLibraryTrash } from '../../lib/libraryApi'
import { formatBytes } from '../../lib/uploadQueue'
import styles from './EmptyTrashModal.module.css'

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Confirmación
 * destructiva antes de purgar TODA la papelera de la biblioteca (assets +
 * carpetas trasheadas) de la empresa — POST /trash/empty. Reporta
 * `freedBytes`/`foldersDeleted` reales de la respuesta a `onEmptied` para
 * que LibraryPage arme el aviso final.
 */
export default function EmptyTrashModal({ open, onClose, companyId, assetCount = 0, trashedBytes = 0, onEmptied }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const descId = useId()

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError('')
  }, [open])

  async function handleConfirm() {
    if (!companyId) return
    setBusy(true)
    setError('')
    try {
      const result = await emptyLibraryTrash(companyId)
      onEmptied?.(result)
      onClose?.()
    } catch (err) {
      setError(err.message || 'No se pudo vaciar la papelera')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Vaciar papelera"
      ariaDescribedBy={descId}
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
    >
      <p id={descId} className={styles.message}>
        Se eliminarán definitivamente {assetCount} elemento{assetCount === 1 ? '' : 's'} ({formatBytes(trashedBytes)}).
        Esta acción no se puede deshacer.
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="danger"
          loading={busy}
          disabled={busy || assetCount === 0}
          onClick={handleConfirm}
        >
          Vaciar papelera
        </Button>
      </div>
    </Modal>
  )
}
