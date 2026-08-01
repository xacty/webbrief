import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Folder, Info } from 'lucide-react'
import { Modal, Button } from '../ui'
import { createFolder } from '../../lib/libraryApi'
import { formatBytes, EXCLUDE_REASON_LABELS } from '../../lib/uploadQueue'
import styles from './FolderUploadConfirmModal.module.css'

const MAX_EXCLUDED_ROWS = 12

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

// Todas las rutas de carpeta implicadas por los archivos aceptados,
// incluyendo intermedias sin archivos propios (una carpeta que sólo
// contiene subcarpetas igual debe crearse para que sus hijas tengan
// padre). Ordenadas raíz→hijas (por profundidad, luego alfabético) para
// que createFolder pueda ir resolviendo cada nivel con el padre ya creado.
function collectFolderPaths(accepted) {
  const paths = new Set()
  for (const { relativePath } of accepted) {
    if (!relativePath) continue
    const segments = relativePath.split('/')
    let acc = ''
    for (const segment of segments) {
      acc = acc ? `${acc}/${segment}` : segment
      paths.add(acc)
    }
  }
  return [...paths].sort((a, b) => {
    const depthDiff = a.split('/').length - b.split('/').length
    return depthDiff || a.localeCompare(b, 'es')
  })
}

// Conteo/tamaño de archivos que viven DIRECTAMENTE en cada ruta (no en sus
// subcarpetas) — lo que se muestra junto a cada fila del árbol.
function directCounts(accepted) {
  const map = new Map()
  for (const { file, relativePath } of accepted) {
    if (!relativePath) continue
    const info = map.get(relativePath) || { count: 0, bytes: 0 }
    info.count += 1
    info.bytes += file.size
    map.set(relativePath, info)
  }
  return map
}

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Revisión previa a
 * subir una carpeta arrastrada completa: árbol de subcarpetas detectadas,
 * total de imágenes aceptadas, aviso de conversión y bloque de excluidos.
 * Al confirmar crea las carpetas (raíz → hijas, cacheando ruta→folderId) y
 * recién ahí encola los archivos aceptados en la cola real
 * (queueRef.current.add) apuntando cada uno a su carpeta resuelta.
 */
export default function FolderUploadConfirmModal({
  open,
  companyId,
  parentFolderId,
  queueRef,
  folderName,
  accepted = [],
  excluded = [],
  onClose,
  onConfirmed,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setBusy(false)
      setError('')
    }
  }, [open])

  const paths = useMemo(() => collectFolderPaths(accepted), [accepted])
  const counts = useMemo(() => directCounts(accepted), [accepted])
  const totalBytes = useMemo(() => accepted.reduce((sum, entry) => sum + entry.file.size, 0), [accepted])

  async function handleConfirm() {
    if (!accepted.length || !companyId) return
    setBusy(true)
    setError('')
    try {
      const idByPath = new Map()
      for (const path of paths) {
        const segments = path.split('/')
        const name = segments[segments.length - 1]
        const parentPath = segments.slice(0, -1).join('/')
        const resolvedParentId = parentPath ? idByPath.get(parentPath) : (parentFolderId || null)
        const { folder } = await createFolder(companyId, { name, parentFolderId: resolvedParentId })
        idByPath.set(path, folder.id)
      }
      const toEnqueue = accepted.map((entry) => ({ file: entry.file, folderId: idByPath.get(entry.relativePath) }))
      queueRef?.current?.add(toEnqueue)
      onConfirmed?.()
    } catch (err) {
      setError(err.message || 'No se pudieron crear las carpetas. Intenta de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const visibleExcluded = excluded.slice(0, MAX_EXCLUDED_ROWS)
  const hiddenExcludedCount = excluded.length - visibleExcluded.length

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Subir carpeta «${folderName || ''}»`}
      size="lg"
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
    >
      <p className={styles.summary}>
        {accepted.length} imagen{accepted.length === 1 ? '' : 'es'} · {formatBytes(totalBytes)}
      </p>

      {paths.length > 0 && (
        <div className={styles.tree}>
          {paths.map((path) => {
            const segments = path.split('/')
            const depth = segments.length - 1
            const name = segments[segments.length - 1]
            const info = counts.get(path)
            return (
              <div key={path} className={styles.treeRow} style={{ '--depth': depth }}>
                <Folder size={16} className={styles.treeIcon} aria-hidden="true" />
                <span className={styles.treeName}>{name}</span>
                {info?.count > 0 && (
                  <span className={styles.treeCount}>
                    {info.count} imagen{info.count === 1 ? '' : 'es'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      <p className={styles.infoNote}>
        <Info size={16} className={styles.infoIcon} aria-hidden="true" />
        Se convertirán a WebP ≤2560px al subir; los PNG conservan su formato.
      </p>

      {excluded.length > 0 && (
        <div className={styles.excludedBlock}>
          <p className={styles.excludedTitle}>
            <AlertTriangle size={16} className={styles.excludedIcon} aria-hidden="true" />
            {excluded.length} archivo{excluded.length === 1 ? '' : 's'} no se {excluded.length === 1 ? 'subirá' : 'subirán'}
          </p>
          <ul className={styles.excludedList}>
            {visibleExcluded.map((entry, index) => (
              <li key={`${entry.relativePath}/${entry.file.name}-${index}`} className={styles.excludedRow}>
                <span className={styles.excludedName}>
                  {entry.relativePath ? `${entry.relativePath}/${entry.file.name}` : entry.file.name}
                </span>
                <span className={styles.excludedReason}>{EXCLUDE_REASON_LABELS[entry.reason] || 'No compatible'}</span>
              </li>
            ))}
            {hiddenExcludedCount > 0 && (
              <li className={cx(styles.excludedRow, styles.excludedMore)}>y {hiddenExcludedCount} más</li>
            )}
          </ul>
        </div>
      )}

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
          disabled={busy || accepted.length === 0}
          onClick={handleConfirm}
        >
          Subir {accepted.length} imagen{accepted.length === 1 ? '' : 'es'}
        </Button>
      </div>
    </Modal>
  )
}
