import { Images } from 'lucide-react'
import { Modal } from '../ui'
import { formatBytes } from '../../lib/uploadQueue'
import { assetImageUrl, formatDateEs, formatDimensions, mimeLabel } from '../../lib/libraryAssetUtils'
import styles from './AssetInfoModal.module.css'

/**
 * Panel de información (iteración UX F1, punto 5) — sólo lectura: miniatura
 * chica + filas etiqueta/valor. Abre desde el kebab de AssetGrid ("Información",
 * primer item) y desde LibraryContextMenu (mismo item, right-click). Usa
 * `Modal` de ui/ — ver DESIGN-SYSTEM.md §"Modal anatomy".
 *
 * `folders` es `data.allFolders` (árbol completo activo de la empresa, ya
 * expuesto por el backend para MoveToFolderModal — ver CONTEXT.min
 * target=library) para resolver el nombre de la carpeta actual sin pedirle
 * un fetch aparte a LibraryPage. Un asset con `project_id` viene de un
 * documento (picker del editor / origen distinto a "subida a biblioteca");
 * el nombre del proyecto no está en el shape actual del asset, así que se
 * muestra un texto genérico en vez de agregar un fetch sólo para esto
 * (instrucción explícita del punto 5).
 */
export default function AssetInfoModal({ open, onClose, asset, folders = [] }) {
  if (!open || !asset) return null

  const thumb = assetImageUrl(asset, 300)
  const locationLabel = asset.project_id
    ? 'En un documento del proyecto'
    : folders.find((folder) => folder.id === asset.folder_id)?.name || 'Biblioteca'

  const rows = [
    { label: 'Nombre', value: asset.file_name || '—' },
    { label: 'Formato', value: mimeLabel(asset.mime_type) },
    { label: 'Peso', value: formatBytes(asset.file_size) || '—' },
    { label: 'Dimensiones', value: formatDimensions(asset.width, asset.height) },
    { label: 'Subida', value: formatDateEs(asset.created_at) },
    { label: 'Subida por', value: asset.uploaded_by ? 'Equipo' : 'Respuesta de brief' },
    { label: 'Ubicación', value: locationLabel },
  ]

  return (
    <Modal open={open} onClose={onClose} title="Información de la imagen" size="sm">
      <div className={styles.preview}>
        {thumb ? (
          <img src={thumb} alt="" className={styles.thumb} />
        ) : (
          <span className={styles.thumbFallback} aria-hidden="true">
            <Images size={28} />
          </span>
        )}
      </div>

      <dl className={styles.rows}>
        {rows.map((row) => (
          <div key={row.label} className={styles.row}>
            <dt className={styles.rowLabel}>{row.label}</dt>
            <dd className={styles.rowValue}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}
