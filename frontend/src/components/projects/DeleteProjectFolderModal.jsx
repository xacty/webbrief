import { useEffect, useId, useMemo, useState } from 'react'
import { Modal, Button } from '../ui'
import { deleteProjectFolder } from '../../lib/projectFoldersApi'
import styles from './DeleteProjectFolderModal.module.css'

// Arma la frase de confirmación con los conteos de reparenteo — ver
// DESIGN-SYSTEM.md, esta ola decide que borrar una carpeta de proyectos
// JAMÁS toca los proyectos: sus contenidos directos (proyectos +
// subcarpetas) se reparentan al padre de la borrada, o a la raíz si no
// tenía padre. Los conteos se calculan client-side (ver
// ProjectsPage.jsx) a partir de `projects`/`folders` ya cargados — evita
// una llamada extra sólo para previsualizar el borrado, y queda
// automáticamente en sync con cualquier mutación local previa (archivar,
// mover, etc.) sin depender de que `folder.projectCount` (del último GET)
// siga fresco.
function buildConfirmationMessage({ name, directProjectCount, directSubfolderCount, destinationLabel }) {
  const parts = []
  if (directProjectCount > 0) {
    parts.push(`${directProjectCount} proyecto${directProjectCount === 1 ? '' : 's'}`)
  }
  if (directSubfolderCount > 0) {
    parts.push(`${directSubfolderCount} subcarpeta${directSubfolderCount === 1 ? '' : 's'}`)
  }
  if (parts.length === 0) {
    return `Se eliminará la carpeta «${name}». No contiene proyectos ni subcarpetas.`
  }
  const verb = (directProjectCount + directSubfolderCount) === 1 ? 'se moverá' : 'se moverán'
  return `Se eliminará la carpeta «${name}». ${parts.join(' y ')} ${verb} a ${destinationLabel}.`
}

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Mirrors
 * library/EmptyTrashModal.jsx (confirmación destructiva de una sola
 * acción), pero el mensaje es dinámico según los conteos de reparenteo en
 * vez de un tamaño fijo — ver buildConfirmationMessage arriba.
 *
 * `folder` = la carpeta a eliminar. `allFolders`/`projects` = los arrays
 * completos ya cargados por ProjectsPage (no se piden de nuevo acá).
 */
export default function DeleteProjectFolderModal({ open, onClose, companyId, folder, allFolders = [], projects = [], onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const descId = useId()

  useEffect(() => {
    if (!open) return
    setBusy(false)
    setError('')
  }, [open])

  const preview = useMemo(() => {
    if (!folder) return null
    const directProjectCount = projects.filter((p) => (p.folderId || null) === folder.id).length
    const directSubfolderCount = allFolders.filter((f) => (f.parent_folder_id || null) === folder.id).length
    const parent = allFolders.find((f) => f.id === (folder.parent_folder_id || null))
    const destinationLabel = parent ? `la carpeta «${parent.name}»` : 'la raíz'
    return {
      directProjectCount,
      directSubfolderCount,
      newParentId: folder.parent_folder_id || null,
      message: buildConfirmationMessage({ name: folder.name, directProjectCount, directSubfolderCount, destinationLabel }),
    }
  }, [folder, allFolders, projects])

  async function handleConfirm() {
    if (!companyId || !folder) return
    setBusy(true)
    setError('')
    try {
      const result = await deleteProjectFolder(companyId, folder.id)
      onDeleted?.({ folder, newParentId: preview?.newParentId ?? null, ...result })
      onClose?.()
    } catch (err) {
      setError(err.message || 'No se pudo eliminar la carpeta')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Eliminar carpeta"
      ariaDescribedBy={descId}
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
    >
      <p id={descId} className={styles.message}>
        {preview?.message}
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
        <Button type="button" variant="danger" loading={busy} disabled={busy} onClick={handleConfirm}>
          Eliminar carpeta
        </Button>
      </div>
    </Modal>
  )
}
