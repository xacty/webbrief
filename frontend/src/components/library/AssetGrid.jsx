import { useState } from 'react'
import { Check, Download, Folder, Images, Move, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Button, KebabMenu } from '../ui'
import EmptyState from '../onboarding/EmptyState'
import styles from './AssetGrid.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const SKELETON_COUNT = 8
const EMPTY_SELECTION = new Set()

// Drag & drop mime types (Task: iteración UX F1). Namespaced so
// UploadDropzone can tell internal card drags apart from OS file drags —
// see the isInternalDrag filter in UploadDropzone.jsx.
const ASSET_DRAG_TYPE = 'application/x-webrief-assets'
const FOLDER_DRAG_TYPE = 'application/x-webrief-folder'

// ImageKit-hosted assets get an on-the-fly transform for the grid thumbnail;
// Supabase Storage assets (SVG passthrough) are served as-is — no transform
// pipeline for that bucket.
function assetThumbUrl(asset) {
  if (!asset?.public_url) return null
  if (asset.storage_bucket !== 'imagekit') return asset.public_url
  const separator = asset.public_url.includes('?') ? '&' : '?'
  return `${asset.public_url}${separator}tr=w-300`
}

// Off-screen pill used as the custom drag image when a multi-selection is
// dragged together (see handleAssetDragStart). Built with a CSS module
// class (tokens, no inline styles) even though the element itself is
// never visible on-screen — only used as the browser's drag-image
// snapshot, then removed on the next tick.
function createDragGhost(text) {
  const el = document.createElement('div')
  el.className = styles.dragGhost
  el.textContent = text
  document.body.appendChild(el)
  return el
}

/**
 * Folder + asset grid for LibraryPage. Folders render as a compact chip row
 * ABOVE the grid (icon + name + count + kebab); assets render as photo
 * cards below, always visible regardless of folder count — see
 * DESIGN-SYSTEM.md §"Biblioteca de imágenes" component inventory.
 *
 * Selección por click (feedback de producto, iteración post-Task 13): un
 * solo click en una card de asset togglea su selección en cualquier
 * momento, sin "select mode" previo; doble click (o Enter con foco) abre
 * el Lightbox sobre la MISMA lista `assets` que esta grilla está
 * renderizando (index posicional), también en vista papelera. El segundo
 * click del doble click se ignora vía `event.detail > 1` en
 * handleAssetClick — así el dblclick no deja la card deseleccionada a
 * mitad de camino: el primer click togglea, el segundo es no-op, y el
 * dblclick abre el Lightbox por su lado.
 *
 * Sólo los ASSETS son seleccionables — los contratos bulk del backend
 * (`bulk/move|trash|restore`) operan sobre ids de asset; las carpetas
 * tienen sus propias rutas singulares (`folders/:id/trash|restore`), así
 * que se accionan una a la vez desde su kebab, nunca desde el toolbar de
 * selección múltiple. Un click sobre un folder chip mientras hay assets
 * seleccionados es un no-op (no navega, para no "perder" la selección
 * activa por accidente) en vez de abrir la carpeta.
 *
 * Drag & drop nativo (HTML5, sin librerías): asset cards y folder chips
 * son `draggable`. Arrastrar un asset SELECCIONADO arrastra TODA la
 * selección (`ASSET_DRAG_TYPE`, JSON de ids); arrastrar uno NO
 * seleccionado arrastra sólo ese, sin tocar la selección. Arrastrar un
 * folder chip lleva su id en `FOLDER_DRAG_TYPE`. Drop targets: los folder
 * chips (reciben assets o folders) — el crumb "Biblioteca" de la raíz vive
 * en LibraryPage.jsx y comparte el mismo contrato de dataTransfer. La
 * mutación real (moveAssets/updateFolder) vive en LibraryPage; este
 * componente sólo arma los payloads y llama onDropAssets/onDropFolder.
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
  onOpenLightbox,
  onRenameAsset,
  onMoveAsset,
  onExportAsset,
  onTrashAsset,
  onRenameFolder,
  onMoveFolder,
  onTrashFolder,
  onDropAssets,
  onDropFolder,
}) {
  const isTrash = view === 'trash'
  const inSelectMode = selectedIds.size > 0
  // Highlights the folder chip currently under a drag — only ever one at a
  // time, so a single id (not a Set) is enough.
  const [dragOverFolderId, setDragOverFolderId] = useState(null)

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
  // las carpetas activas de la RAÍZ, no carpetas trasheadas. Este componente
  // ya ignora `folders` por completo en la vista papelera (`!isTrash &&
  // folders.length > 0` más abajo), así que también debe ignorarlas al
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

  function handleFolderDragStart(event, folder) {
    if (!canWrite) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(FOLDER_DRAG_TYPE, folder.id)
  }

  function handleFolderDragOver(event, folder) {
    if (!canWrite) return
    const types = event.dataTransfer.types || []
    if (!types.includes(ASSET_DRAG_TYPE) && !types.includes(FOLDER_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id)
  }

  // Checks relatedTarget containment so hovering between a chip's own
  // children (icon/name/kebab) doesn't flicker the highlight on and off —
  // dragleave fires on every child boundary crossing, not just when the
  // pointer actually leaves the chip.
  function handleFolderDragLeave(event, folderId) {
    const related = event.relatedTarget
    if (related && event.currentTarget.contains(related)) return
    setDragOverFolderId((current) => (current === folderId ? null : current))
  }

  function handleFolderDrop(event, folder) {
    event.preventDefault()
    // Folder chips render inside UploadDropzone's wrapping zone — stop the
    // event here so its onDrop doesn't also see this internal move (it
    // already ignores it via the application/x-webrief-* filter, but
    // there's no reason to let it re-run readDroppedItems for nothing).
    event.stopPropagation()
    setDragOverFolderId(null)
    if (!canWrite) return
    const assetsPayload = event.dataTransfer.getData(ASSET_DRAG_TYPE)
    if (assetsPayload) {
      let ids = []
      try {
        ids = JSON.parse(assetsPayload)
      } catch {
        ids = []
      }
      if (Array.isArray(ids) && ids.length) onDropAssets?.(ids, folder.id)
      return
    }
    const draggedFolderId = event.dataTransfer.getData(FOLDER_DRAG_TYPE)
    // Una carpeta no puede droppearse sobre sí misma.
    if (draggedFolderId && draggedFolderId !== folder.id) {
      onDropFolder?.(draggedFolderId, folder.id)
    }
  }

  function handleAssetClick(event, assetId) {
    if (event.detail > 1) return
    onToggleSelect?.(assetId)
  }

  function handleAssetKeyDown(event, assetId, index) {
    if (event.target.closest?.('button, [role="menu"]')) return
    if (event.key === 'Enter') {
      event.preventDefault()
      onOpenLightbox?.(index)
    } else if (event.key === ' ') {
      event.preventDefault()
      onToggleSelect?.(assetId)
    }
  }

  function handleAssetDragStart(event, asset) {
    if (!canWrite || isTrash) {
      event.preventDefault()
      return
    }
    const ids = selectedIds.has(asset.id) && selectedIds.size > 0 ? Array.from(selectedIds) : [asset.id]
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(ASSET_DRAG_TYPE, JSON.stringify(ids))
    if (ids.length > 1) {
      const ghost = createDragGhost(`${ids.length} imágenes`)
      event.dataTransfer.setDragImage(ghost, 16, 16)
      window.setTimeout(() => ghost.remove(), 0)
    }
  }

  return (
    <div className={styles.wrap}>
      {!isTrash && folders.length > 0 && (
        <div className={styles.folderSection}>
          <p className={styles.folderSectionTitle}>Carpetas</p>
          <div className={styles.folderChipRow}>
            {folders.map((folder) => {
              const itemCount = folder.itemCount ?? folder.assetCount
              return (
                <div
                  key={folder.id}
                  role="button"
                  tabIndex={0}
                  draggable={canWrite}
                  aria-label={folder.name}
                  className={cx(styles.folderChip, dragOverFolderId === folder.id && styles.folderChipDragOver)}
                  onClick={() => handleFolderActivate(folder.id)}
                  onKeyDown={(event) => handleFolderKeyDown(event, folder.id)}
                  onDragStart={(event) => handleFolderDragStart(event, folder)}
                  onDragOver={(event) => handleFolderDragOver(event, folder)}
                  onDragLeave={(event) => handleFolderDragLeave(event, folder.id)}
                  onDrop={(event) => handleFolderDrop(event, folder)}
                  onDragEnd={() => setDragOverFolderId(null)}
                >
                  <Folder size={16} className={styles.folderChipIcon} aria-hidden="true" />
                  <span className={styles.folderChipName}>{folder.name}</span>
                  {Number.isFinite(itemCount) && <span className={styles.folderChipCount}>{itemCount}</span>}
                  {canWrite && (
                    <div className={styles.folderChipKebab} onClick={(event) => event.stopPropagation()}>
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
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className={styles.grid}>
        {assets.map((asset, index) => {
          const thumb = assetThumbUrl(asset)
          const isSelected = selectedIds.has(asset.id)
          return (
            <div
              key={asset.id}
              role={canWrite ? 'button' : undefined}
              tabIndex={canWrite ? 0 : undefined}
              aria-pressed={canWrite ? (isSelected ? 'true' : 'false') : undefined}
              draggable={canWrite && !isTrash}
              className={cx(
                styles.assetCard,
                canWrite && styles.assetCardSelectable,
                isTrash && styles.assetCardTrashed,
                isSelected && styles.assetCardSelected
              )}
              onClick={canWrite ? (event) => handleAssetClick(event, asset.id) : undefined}
              onDoubleClick={canWrite ? () => onOpenLightbox?.(index) : undefined}
              onKeyDown={canWrite ? (event) => handleAssetKeyDown(event, asset.id, index) : undefined}
              onDragStart={canWrite && !isTrash ? (event) => handleAssetDragStart(event, asset) : undefined}
            >
              {isSelected && (
                <span className={styles.selectedBadge} aria-hidden="true">
                  <Check size={12} strokeWidth={3} />
                </span>
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

              <div className={styles.cardFooter}>
                <span className={styles.cardName}>{asset.file_name}</span>
                {canWrite && !isTrash && (
                  <div className={styles.kebabSlot} onClick={(event) => event.stopPropagation()}>
                    <KebabMenu
                      label={`Más acciones de ${asset.file_name}`}
                      placement="bottom-end"
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
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
