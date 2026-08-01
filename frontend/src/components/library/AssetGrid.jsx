import { Folder, Images, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '../ui'
import EmptyState from '../onboarding/EmptyState'
import styles from './AssetGrid.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const SKELETON_COUNT = 8

// ImageKit-hosted assets get an on-the-fly transform for the grid thumbnail;
// Supabase Storage assets (SVG passthrough) are served as-is — no transform
// pipeline for that bucket.
function assetThumbUrl(asset) {
  if (!asset?.public_url) return null
  if (asset.storage_bucket !== 'imagekit') return asset.public_url
  const separator = asset.public_url.includes('?') ? '&' : '?'
  return `${asset.public_url}${separator}tr=w-300`
}

/**
 * Folder + asset grid for LibraryPage. Subfolders render first (icon + name
 * + count when the backend provides one), then assets as thumbnail cards.
 * Selection, kebab actions, drag & drop and restore land in Tasks 12-13 —
 * this component is display + folder navigation only.
 */
export default function AssetGrid({
  folders = [],
  assets = [],
  loading = false,
  error = false,
  onRetry,
  onOpenFolder,
  canWrite = false, // reserved for per-item actions wired in Task 13
  view = null,
}) {
  const isTrash = view === 'trash'

  if (loading) {
    return (
      <div className={styles.grid} aria-busy="true" aria-label="Cargando biblioteca">
        {Array.from({ length: SKELETON_COUNT }, (_, index) => (
          <div key={index} className={styles.skeletonCard} aria-hidden="true" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.errorState} role="alert">
        <p className={styles.errorText}>No se pudo cargar la biblioteca.</p>
        <Button type="button" variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={onRetry}>
          Reintentar
        </Button>
      </div>
    )
  }

  const isEmpty = folders.length === 0 && assets.length === 0

  if (isEmpty) {
    return isTrash ? (
      <EmptyState
        icon={Trash2}
        title="La papelera está vacía"
        body="Las imágenes que envíes a la papelera aparecen aquí hasta por 30 días."
      />
    ) : (
      <EmptyState icon={Images} title="Arrastra imágenes o crea una carpeta para empezar" />
    )
  }

  return (
    <div className={styles.grid}>
      {!isTrash && folders.map((folder) => {
        const itemCount = folder.itemCount ?? folder.assetCount
        return (
          <button
            key={folder.id}
            type="button"
            className={styles.folderCard}
            onClick={() => onOpenFolder?.(folder.id)}
          >
            <span className={styles.folderIcon} aria-hidden="true">
              <Folder size={26} />
            </span>
            <span className={styles.cardName}>{folder.name}</span>
            {Number.isFinite(itemCount) && <span className={styles.folderCount}>{itemCount}</span>}
          </button>
        )
      })}

      {assets.map((asset) => {
        const thumb = assetThumbUrl(asset)
        return (
          <div key={asset.id} className={cx(styles.assetCard, isTrash && styles.assetCardTrashed)}>
            <div className={styles.thumbWrap}>
              {thumb ? (
                <img src={thumb} alt="" loading="lazy" className={styles.thumb} />
              ) : (
                <span className={styles.thumbFallback} aria-hidden="true">
                  <Images size={22} />
                </span>
              )}
            </div>
            <span className={styles.cardName}>{asset.file_name}</span>
          </div>
        )
      })}
    </div>
  )
}
