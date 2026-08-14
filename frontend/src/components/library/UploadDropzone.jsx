import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { readDroppedItems, partitionEntries, enqueueFiles } from '../../lib/uploadQueue'
import FolderUploadConfirmModal from './FolderUploadConfirmModal'
import styles from './UploadDropzone.module.css'

/**
 * Envuelve el contenido central de LibraryPage (grid + footer) y escucha
 * drag&drop en todo ese contenedor. Carpeta arrastrada (webkitGetAsEntry
 * detecta un directorio) → abre FolderUploadConfirmModal para revisar
 * árbol, total y excluidos antes de crear nada. Archivos sueltos → van
 * directo a la cola en la carpeta que se está viendo.
 *
 * `queueRef` se recibe como ref (no como valor ya resuelto) para no
 * depender de que LibraryPage vuelva a renderizar justo cuando
 * createUploadQueue() termina de instanciarse — los handlers leen
 * queueRef.current recién en el momento del evento, siempre al día.
 */
export default function UploadDropzone({
  companyId,
  folderId,
  folderLabel,
  queueRef,
  disabled = false,
  onQueued,
  children,
}) {
  const [dragActive, setDragActive] = useState(false)
  const [confirmState, setConfirmState] = useState(null) // { folderName, accepted, excluded } | null
  const dragCounter = useRef(0)

  // AssetGrid cards/folder chips are draggable too (Task: iteración UX F1
  // drag & drop para mover) and set custom `application/x-webrief-*` mime
  // types with no OS files attached. Without this filter, a drag started
  // on a card would still fire dragenter here (types is non-empty) and pop
  // this dropzone's "suelta para subir" overlay over an internal move —
  // explicitly excluded so only real OS file drags open it.
  function isInternalDrag(event) {
    const types = Array.from(event.dataTransfer?.types || [])
    return types.some((type) => type.startsWith('application/x-webrief-'))
  }

  function hasFiles(event) {
    if (isInternalDrag(event)) return false
    return Array.from(event.dataTransfer?.types || []).includes('Files')
  }

  function handleDragEnter(event) {
    if (disabled || !hasFiles(event)) return
    event.preventDefault()
    dragCounter.current += 1
    setDragActive(true)
  }

  function handleDragOver(event) {
    if (disabled || !hasFiles(event)) return
    event.preventDefault()
  }

  function handleDragLeave(event) {
    if (disabled) return
    dragCounter.current = Math.max(0, dragCounter.current - 1)
    if (dragCounter.current === 0) setDragActive(false)
  }

  async function handleDrop(event) {
    if (disabled) return
    event.preventDefault()
    dragCounter.current = 0
    setDragActive(false)

    const queue = queueRef?.current
    if (!queue) return

    const dtItems = event.dataTransfer?.items
    let result = { files: [], folderName: null }
    if (dtItems?.length) result = await readDroppedItems(dtItems)

    // Fallback defensivo: navegadores sin webkitGetAsEntry (o que no
    // resolvieron ninguna entry) igual traen los File planos en
    // dataTransfer.files — sin detección de carpeta, pero sin perder el
    // drop en silencio.
    if (!result.files.length && event.dataTransfer?.files?.length) {
      result = {
        files: Array.from(event.dataTransfer.files).map((file) => ({ file, relativePath: '' })),
        folderName: null,
      }
    }
    if (!result.files.length) return

    if (result.folderName) {
      const { accepted, excluded } = partitionEntries(result.files)
      setConfirmState({ folderName: result.folderName, accepted, excluded })
      return
    }

    const { acceptedCount, excludedCount } = enqueueFiles(queue, result.files.map((entry) => entry.file), folderId)
    if (acceptedCount || excludedCount) onQueued?.()
  }

  return (
    <div
      className={styles.zone}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}

      {dragActive && !disabled && (
        <div className={styles.overlay} aria-hidden="true">
          <div className={styles.overlayCard}>
            <UploadCloud size={32} className={styles.overlayIcon} />
            <p className={styles.overlayTitle}>Suelta para subir en «{folderLabel}»</p>
            <p className={styles.overlaySubtitle}>JPG, PNG, WebP, GIF o SVG · hasta 30 MB por archivo</p>
          </div>
        </div>
      )}

      <FolderUploadConfirmModal
        open={!!confirmState}
        companyId={companyId}
        parentFolderId={folderId}
        queueRef={queueRef}
        folderName={confirmState?.folderName}
        accepted={confirmState?.accepted || []}
        excluded={confirmState?.excluded || []}
        onClose={() => setConfirmState(null)}
        onConfirmed={() => {
          setConfirmState(null)
          onQueued?.()
        }}
      />
    </div>
  )
}
