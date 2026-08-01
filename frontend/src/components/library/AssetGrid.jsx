import { Download, Folder, Images, Move, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Button, KebabMenu } from '../ui'
import EmptyState from '../onboarding/EmptyState'
import styles from './AssetGrid.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const SKELETON_COUNT = 8
const EMPTY_SELECTION = new Set()

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
 *
 * Multiselección (Task 13): sólo los ASSETS son seleccionables — los
 * contratos bulk del backend (`bulk/move|trash|restore`) operan sobre ids
 * de asset; las carpetas tienen sus propias rutas singulares
 * (`folders/:id/trash|restore`), así que se accionan una a la vez desde su
 * kebab, nunca desde el toolbar de selección múltiple. Por eso las folder
 * cards NUNCA muestran checkbox, y un click sobre una folder card mientras
 * hay assets seleccionados es un no-op (no navega, para no "perder" la
 * selección activa por accidente) en vez de toggle.
 *
 * Patrón de activación por click, mismo que ProjectsPage.handleProjectActivate:
 *   - asset card, hay selección → toggle
 *   - asset card, no hay selección → no-op (no hay preview/lightbox en F1)
 *   - folder card, hay selección → no-op
 *   - folder card, no hay selección → abrir carpeta
 */
export default function AssetGrid({
  folders = [],
  assets = [],
  loading = false,
  error = false,
  onRetry,
  onOpenFolder,
  canWrite = false,
  view = null,
  selectedIds = EMPTY_SELECTION,
  onToggleSelect,
  onRenameAsset,
  onMoveAsset,
  onExportAsset,
  onTrashAsset,
  onRenameFolder,
  onMoveFolder,
  onTrashFolder,
}) {
  const isTrash = view === 'trash'
  const inSelectMode = selectedIds.size > 0

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

  // NOTA (encontrado durante verificación manual de Task 13): el backend
  // (GET /, library.js) calcula `subfolders` a partir del `folderId` de la
  // request SIN filtrar por `view` — cuando la vista papelera navega sin
  // folderId (toggleTrashView limpia los search params), `subfolders` trae
  // las carpetas activas de la RAÍZ, no carpetas trasheadas. Esta grilla ya
  // ignora `folders` por completo en la vista papelera (`!isTrash &&
  // folders.map(...)` más abajo), así que también debe ignorarlas al
  // decidir si mostrar el estado vacío — si no, "Papelera" nunca muestra
  // "La papelera está vacía" mientras exista alguna carpeta activa en la
  // raíz de la biblioteca.
  const isEmpty = (isTrash || folders.length === 0) && assets.length === 0

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

  function handleFolderActivate(folderId) {
    if (inSelectMode) return
    onOpenFolder?.(folderId)
  }

  function handleFolderKeyDown(event, folderId) {
    if (event.target.closest?.('button, [role="menu"]')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleFolderActivate(folderId)
    }
  }

  function handleAssetActivate(assetId) {
    if (inSelectMode) onToggleSelect?.(assetId)
  }

  function handleAssetKeyDown(event, assetId) {
    if (event.target.closest?.('button, input, label, [role="menu"]')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleAssetActivate(assetId)
    }
  }

  return (
    <div className={styles.grid}>
      {!isTrash && folders.map((folder) => {
        const itemCount = folder.itemCount ?? folder.assetCount
        return (
          <div
            key={folder.id}
            role="button"
            tabIndex={0}
            className={styles.folderCard}
            onClick={() => handleFolderActivate(folder.id)}
            onKeyDown={(event) => handleFolderKeyDown(event, folder.id)}
          >
            {canWrite && (
              <div className={styles.kebabSlot} onClick={(event) => event.stopPropagation()}>
                <KebabMenu
                  label={`Más acciones de ${folder.name}`}
                  placement="bottom-start"
                  triggerSize="sm"
                  items={[
                    { label: 'Renombrar', icon: <Pencil size={14} />, onClick: () => onRenameFolder?.(folder) },
                    { label: 'Mover', icon: <Move size={14} />, onClick: () => onMoveFolder?.(folder) },
                    {
                      label: 'Enviar a papelera',
                      icon: <Trash2 size={14} />,
                      destructive: true,
                      onClick: () => onTrashFolder?.(folder),
                    },
                  ]}
                />
              </div>
            )}
            <span className={styles.folderIcon} aria-hidden="true">
              <Folder size={26} />
            </span>
            <span className={styles.cardName}>{folder.name}</span>
            {Number.isFinite(itemCount) && <span className={styles.folderCount}>{itemCount}</span>}
          </div>
        )
      })}

      {assets.map((asset) => {
        const thumb = assetThumbUrl(asset)
        const isSelected = selectedIds.has(asset.id)
        return (
          <div
            key={asset.id}
            role={canWrite ? 'button' : undefined}
            tabIndex={canWrite ? 0 : undefined}
            aria-selected={canWrite && isSelected ? 'true' : undefined}
            className={cx(
              styles.assetCard,
              canWrite && styles.assetCardSelectable,
              isTrash && styles.assetCardTrashed,
              isSelected && styles.assetCardSelected,
              canWrite && inSelectMode && styles.assetCardInSelectMode
            )}
            onClick={canWrite ? () => handleAssetActivate(asset.id) : undefined}
            onKeyDown={canWrite ? (event) => handleAssetKeyDown(event, asset.id) : undefined}
          >
            {canWrite && (
              <label className={styles.selectLabel} onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  className={styles.selectCheckbox}
                  checked={isSelected}
                  onChange={() => onToggleSelect?.(asset.id)}
                  aria-label={isSelected ? `Deseleccionar ${asset.file_name}` : `Seleccionar ${asset.file_name}`}
                />
              </label>
            )}

            {canWrite && !isTrash && (
              <div className={styles.kebabSlot} onClick={(event) => event.stopPropagation()}>
                <KebabMenu
                  label={`Más acciones de ${asset.file_name}`}
                  placement="bottom-start"
                  triggerSize="sm"
                  items={[
                    { label: 'Renombrar', icon: <Pencil size={14} />, onClick: () => onRenameAsset?.(asset) },
                    { label: 'Mover a carpeta', icon: <Move size={14} />, onClick: () => onMoveAsset?.(asset) },
                    { label: 'Exportar', icon: <Download size={14} />, onClick: () => onExportAsset?.(asset) },
                    {
                      label: 'Enviar a papelera',
                      icon: <Trash2 size={14} />,
                      destructive: true,
                      onClick: () => onTrashAsset?.(asset),
                    },
                  ]}
                />
              </div>
            )}

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
