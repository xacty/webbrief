import { useEffect, useId, useMemo, useState } from 'react'
import { Folder } from 'lucide-react'
import { Modal, Button } from '../ui'
import styles from './MoveToFolderModal.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

// Aplana el árbol de carpetas en filas ordenadas raíz→hijas (alfabético
// dentro de cada nivel) con su profundidad — mismo criterio de recorrido
// que FolderUploadConfirmModal.collectFolderPaths, pero sobre folder_id/
// parent_folder_id reales en vez de relativePath de archivos arrastrados.
// Profundidad arranca en 1 porque la fila "Biblioteca" (raíz, id null)
// ocupa la profundidad 0 por fuera de esta función.
function buildFolderRows(folders) {
  const byParent = new Map()
  for (const folder of folders || []) {
    const key = folder.parent_folder_id || null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(folder)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, 'es'))
  }
  const rows = []
  function walk(parentId, depth) {
    for (const folder of byParent.get(parentId) || []) {
      rows.push({ id: folder.id, name: folder.name, depth })
      walk(folder.id, depth + 1)
    }
  }
  walk(null, 1)
  return rows
}

// Carpeta + todos sus descendientes — usado para deshabilitar destinos
// inválidos cuando se mueve una carpeta (no puede moverse dentro de sí
// misma ni de un descendiente). El backend igual valida esto
// (wouldCreateFolderCycle en library.js); esto es sólo UX preventiva para
// no dejar elegir algo que el submit rechazaría con un 400.
function collectDescendantIds(folders, folderId) {
  const childrenByParent = new Map()
  for (const folder of folders || []) {
    const key = folder.parent_folder_id || null
    if (!childrenByParent.has(key)) childrenByParent.set(key, [])
    childrenByParent.get(key).push(folder.id)
  }
  const result = new Set([folderId])
  const queue = [folderId]
  while (queue.length) {
    const current = queue.shift()
    for (const childId of childrenByParent.get(current) || []) {
      if (!result.has(childId)) {
        result.add(childId)
        queue.push(childId)
      }
    }
  }
  return result
}

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Árbol de carpetas
 * indentado por profundidad, mismo patrón `--depth` + `calc()` que
 * FolderUploadConfirmModal.module.css usa para su árbol de sólo-lectura,
 * aquí con filas seleccionables (role="option").
 *
 * Reusable para dos casos, distinguidos por `moveState.kind`:
 *   - { kind: 'assets', ids: string[] } — mover N imágenes (moveAssets)
 *   - { kind: 'folder', folder: {id, name, parent_folder_id} } — mover una
 *     carpeta (updateFolder parentFolderId); su propio subárbol se
 *     deshabilita como destino.
 *
 * No conoce la API — LibraryPage arma `onConfirm(targetFolderId)` con la
 * llamada real (moveAssets vs updateFolder) y el reload/aviso posterior.
 */
export default function MoveToFolderModal({ open, onClose, folders = [], moveState, onConfirm }) {
  const [selectedFolderId, setSelectedFolderId] = useState(undefined) // undefined = nada elegido aún
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const descId = useId()

  useEffect(() => {
    if (!open) return
    setSelectedFolderId(undefined)
    setBusy(false)
    setError('')
  }, [open, moveState])

  const disabledIds = useMemo(() => {
    if (moveState?.kind === 'folder' && moveState.folder?.id) {
      return collectDescendantIds(folders, moveState.folder.id)
    }
    return new Set()
  }, [folders, moveState])

  const rows = useMemo(() => buildFolderRows(folders), [folders])

  async function handleConfirm() {
    if (selectedFolderId === undefined) return
    setBusy(true)
    setError('')
    try {
      await onConfirm?.(selectedFolderId)
      onClose?.()
    } catch (err) {
      setError(err.message || 'No se pudo mover')
    } finally {
      setBusy(false)
    }
  }

  const count = moveState?.kind === 'assets' ? moveState.ids.length : 1
  const title = moveState?.kind === 'folder'
    ? `Mover la carpeta «${moveState.folder?.name || ''}»`
    : `Mover ${count} ${count === 1 ? 'imagen' : 'imágenes'}`

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      ariaDescribedBy={descId}
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
    >
      <p id={descId} className={styles.subtitle}>Elige la carpeta destino:</p>

      <div className={styles.tree} role="listbox" aria-label="Carpetas">
        <button
          type="button"
          role="option"
          aria-selected={selectedFolderId === null}
          className={cx(styles.treeRow, selectedFolderId === null && styles.treeRowSelected)}
          style={{ '--depth': 0 }}
          onClick={() => setSelectedFolderId(null)}
        >
          <Folder size={16} className={styles.treeIcon} aria-hidden="true" />
          <span className={styles.treeName}>Biblioteca</span>
        </button>

        {rows.map((row) => {
          const isDisabled = disabledIds.has(row.id)
          const isSelected = selectedFolderId === row.id
          return (
            <button
              key={row.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={isDisabled}
              className={cx(styles.treeRow, isSelected && styles.treeRowSelected, isDisabled && styles.treeRowDisabled)}
              style={{ '--depth': row.depth }}
              onClick={() => setSelectedFolderId(row.id)}
              title={isDisabled ? 'No puedes mover una carpeta dentro de sí misma' : undefined}
            >
              <Folder size={16} className={styles.treeIcon} aria-hidden="true" />
              <span className={styles.treeName}>{row.name}</span>
            </button>
          )
        })}
      </div>

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
          variant="primary"
          loading={busy}
          disabled={busy || selectedFolderId === undefined}
          onClick={handleConfirm}
        >
          Mover
        </Button>
      </div>
    </Modal>
  )
}
