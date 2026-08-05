import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Check, Download, Folder, Images, Info, Move, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { Button, KebabMenu } from '../ui'
import EmptyState from '../onboarding/EmptyState'
import { formatBytes } from '../../lib/uploadQueue'
import { assetImageUrl, formatDateEs, formatDimensions, mimeLabel } from '../../lib/libraryAssetUtils'
import { ASSET_DRAG_TYPE, FOLDER_DRAG_TYPE, createDragGhost, dragHasAnyType, isInternalDragLeave } from '../organizer/dnd'
import styles from './AssetGrid.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const SKELETON_COUNT = 8
const EMPTY_SELECTION = new Set()

// Debajo de este ancho, la vista lista se fuerza a grilla (punto 6 de la
// iteración UX F1: "En móvil (<720px) fuerza grid") — el toggle de
// LibraryToolbar sigue reflejando la preferencia guardada, sólo el
// RENDER se resuelve a grilla mientras el viewport es angosto.
const LIST_FORCE_GRID_BREAKPOINT = 720

function useIsNarrowViewport(breakpoint) {
  const [isNarrow, setIsNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth < breakpoint : false))
  useEffect(() => {
    function handleResize() {
      setIsNarrow(window.innerWidth < breakpoint)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [breakpoint])
  return isNarrow
}

// Drag & drop mime types + drag-ghost + dragover/dragleave guards now live
// in organizer/dnd.js (O2.a — shared with ProjectsPage down the line). See
// that file's header comment for the mime-namespacing rationale.

function sortIndicator(field, sortField, sortDir) {
  if (field !== sortField) return null
  const Icon = sortDir === 'asc' ? ArrowUp : ArrowDown
  return <Icon size={12} aria-hidden="true" className={styles.sortArrow} />
}

function ariaSortValue(field, sortField, sortDir) {
  if (field !== sortField) return 'none'
  return sortDir === 'asc' ? 'ascending' : 'descending'
}

/**
 * Folder + asset grid/list for LibraryPage. Folders render as a compact chip
 * row ABOVE the grid (icon + name + count + kebab) in grid layout, or as
 * rows "on top" of the table in list layout; assets render as photo cards
 * (grid) or table rows (list) below — see DESIGN-SYSTEM.md §"Biblioteca de
 * imágenes" component inventory.
 *
 * Selección por click (feedback de producto, iteración post-Task 13): un
 * solo click en una card/fila de asset togglea su selección en cualquier
 * momento, sin "select mode" previo; doble click (o Enter con foco) abre
 * el Lightbox sobre la MISMA lista `assets` que este componente está
 * renderizando (index posicional — ya filtrada/ordenada por LibraryPage,
 * ver punto 3), también en vista papelera. El segundo click del doble
 * click se ignora vía `event.detail > 1` en handleAssetClick — así el
 * dblclick no deja la card deseleccionada a mitad de camino: el primer
 * click togglea, el segundo es no-op, y el dblclick abre el Lightbox por
 * su lado.
 *
 * Sólo los ASSETS son seleccionables — los contratos bulk del backend
 * (`bulk/move|trash|restore`) operan sobre ids de asset; las carpetas
 * tienen sus propias rutas singulares (`folders/:id/trash|restore`), así
 * que se accionan una a la vez desde su kebab/context menu, nunca desde el
 * toolbar de selección múltiple. Un click sobre un folder chip/fila
 * mientras hay assets seleccionados es un no-op (no navega, para no
 * "perder" la selección activa por accidente) en vez de abrir la carpeta.
 *
 * Drag & drop nativo (HTML5, sin librerías): asset cards/filas y folder
 * chips/filas son `draggable`. Arrastrar un asset SELECCIONADO arrastra
 * TODA la selección (`ASSET_DRAG_TYPE`, JSON de ids); arrastrar uno NO
 * seleccionado arrastra sólo ese, sin tocar la selección. Arrastrar un
 * folder chip/fila lleva su id en `FOLDER_DRAG_TYPE`. Drop targets: los
 * folder chips/filas (reciben assets o folders) — el crumb "Biblioteca" de
 * la raíz vive en LibraryPage.jsx y comparte el mismo contrato de
 * dataTransfer. La mutación real (moveAssets/updateFolder) vive en
 * LibraryPage; este componente sólo arma los payloads y llama
 * onDropAssets/onDropFolder.
 *
 * Right-click (punto 4 — ItemContextMenu en organizer/, ver LibraryPage.jsx
 * buildContextMenuItems): SOLO sobre cards/filas de imagen y folder
 * chips/filas — onAssetContextMenu /
 * onFolderContextMenu delegan la decisión de qué variante de menú mostrar
 * (single vs bulk) a LibraryPage, que conoce `selectedIds`. Fuera de esos
 * targets no se intercepta el evento — el menú nativo del navegador queda
 * intacto en el resto de la página.
 */
export default function AssetGrid({
  folders = [],
  assets = [],
  // Cantidad total de assets ANTES del filtro por tipo (punto 3). Permite
  // distinguir "la carpeta está vacía" de "el filtro no matchea nada" sin
  // que este componente conozca el filtro en sí — LibraryPage ya resuelve
  // `assets` filtrado+ordenado, esto es sólo la métrica cruda para el
  // empty-state correcto.
  totalAssetCount,
  loading = false,
  error = false,
  onRetry,
  onOpenFolder,
  canWrite = false,
  view = null,
  layout = 'grid',
  sortField = 'date',
  sortDir = 'desc',
  onSortFieldClick,
  selectedIds = EMPTY_SELECTION,
  onToggleSelect,
  onOpenLightbox,
  onRenameAsset,
  onMoveAsset,
  onExportAsset,
  onTrashAsset,
  onInfoAsset,
  onRenameFolder,
  onMoveFolder,
  onTrashFolder,
  onDropAssets,
  onDropFolder,
  onAssetContextMenu,
  onFolderContextMenu,
}) {
  const isTrash = view === 'trash'
  const inSelectMode = selectedIds.size > 0
  const isNarrowViewport = useIsNarrowViewport(LIST_FORCE_GRID_BREAKPOINT)
  const effectiveLayout = isNarrowViewport ? 'grid' : layout
  // Highlights the folder chip/row currently under a drag — only ever one
  // at a time, so a single id (not a Set) is enough.
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

  const totalCount = Number.isFinite(totalAssetCount) ? totalAssetCount : assets.length
  // NOTA (Task 13): el backend (GET /, library.js) calcula `subfolders` a
  // partir del `folderId` de la request SIN filtrar por `view` — cuando la
  // vista papelera navega sin folderId, `subfolders` trae las carpetas
  // activas de la RAÍZ, no carpetas trasheadas. Este componente ignora
  // `folders` por completo en la vista papelera, así que también debe
  // ignorarlas al decidir si mostrar el estado vacío.
  const librarySectionEmpty = isTrash || folders.length === 0
  const isFullyEmpty = librarySectionEmpty && totalCount === 0
  // El filtro de tipo (punto 3) puede dejar la lista visible en cero
  // aunque la carpeta tenga contenido — ese caso muestra un mensaje más
  // liviano, no el empty-state de "arrastra imágenes para empezar".
  const isFilteredToZero = !isTrash && !isFullyEmpty && assets.length === 0 && totalCount > 0

  if (isFullyEmpty) {
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
    if (!dragHasAnyType(event, [ASSET_DRAG_TYPE, FOLDER_DRAG_TYPE])) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id)
  }

  // isInternalDragLeave checks relatedTarget containment so hovering
  // between a chip's own children (icon/name/kebab) doesn't flicker the
  // highlight on and off — dragleave fires on every child boundary
  // crossing, not just when the pointer actually leaves the chip/row.
  function handleFolderDragLeave(event, folderId) {
    if (isInternalDragLeave(event)) return
    setDragOverFolderId((current) => (current === folderId ? null : current))
  }

  function handleFolderDrop(event, folder) {
    event.preventDefault()
    // Folder chips/rows render inside UploadDropzone's wrapping zone — stop
    // the event here so its onDrop doesn't also see this internal move (it
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

  function assetKebabItems(asset) {
    return [
      { label: 'Información', icon: <Info size={14} />, onClick: () => onInfoAsset?.(asset) },
      { label: 'Renombrar', icon: <Pencil size={14} />, onClick: () => onRenameAsset?.(asset) },
      { label: 'Mover a carpeta', icon: <Move size={14} />, onClick: () => onMoveAsset?.(asset) },
      { label: 'Exportar', icon: <Download size={14} />, onClick: () => onExportAsset?.(asset) },
      {
        label: 'Enviar a papelera',
        icon: <Trash2 size={14} />,
        destructive: true,
        onClick: () => onTrashAsset?.(asset),
      },
    ]
  }

  const showFolderRowsOrChips = !isTrash && folders.length > 0
  const hasListContent = showFolderRowsOrChips || assets.length > 0

  return (
    <div className={styles.wrap}>
      {effectiveLayout === 'grid' && showFolderRowsOrChips && (
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
                  onContextMenu={canWrite ? (event) => onFolderContextMenu?.(event, folder) : undefined}
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

      {effectiveLayout === 'list' && hasListContent && (
        <table className={styles.listTable}>
          <thead>
            <tr>
              <th scope="col" aria-sort={ariaSortValue('name', sortField, sortDir)}>
                <button type="button" className={styles.sortHeaderBtn} onClick={() => onSortFieldClick?.('name')}>
                  Nombre {sortIndicator('name', sortField, sortDir)}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSortValue('size', sortField, sortDir)}>
                <button type="button" className={styles.sortHeaderBtn} onClick={() => onSortFieldClick?.('size')}>
                  Tamaño {sortIndicator('size', sortField, sortDir)}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSortValue('dimensions', sortField, sortDir)}>
                <button type="button" className={styles.sortHeaderBtn} onClick={() => onSortFieldClick?.('dimensions')}>
                  Dimensiones {sortIndicator('dimensions', sortField, sortDir)}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSortValue('format', sortField, sortDir)}>
                <button type="button" className={styles.sortHeaderBtn} onClick={() => onSortFieldClick?.('format')}>
                  Formato {sortIndicator('format', sortField, sortDir)}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSortValue('date', sortField, sortDir)}>
                <button type="button" className={styles.sortHeaderBtn} onClick={() => onSortFieldClick?.('date')}>
                  Fecha {sortIndicator('date', sortField, sortDir)}
                </button>
              </th>
              <th scope="col" className={styles.listActionsHeader}>
                <span className={styles.srOnly}>Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {showFolderRowsOrChips && folders.map((folder) => {
              const itemCount = folder.itemCount ?? folder.assetCount
              return (
                <tr
                  key={folder.id}
                  className={cx(styles.folderRow, dragOverFolderId === folder.id && styles.folderRowDragOver)}
                  tabIndex={0}
                  aria-label={folder.name}
                  draggable={canWrite}
                  onClick={() => handleFolderActivate(folder.id)}
                  onKeyDown={(event) => handleFolderKeyDown(event, folder.id)}
                  onDragStart={(event) => handleFolderDragStart(event, folder)}
                  onDragOver={(event) => handleFolderDragOver(event, folder)}
                  onDragLeave={(event) => handleFolderDragLeave(event, folder.id)}
                  onDrop={(event) => handleFolderDrop(event, folder)}
                  onDragEnd={() => setDragOverFolderId(null)}
                  onContextMenu={canWrite ? (event) => onFolderContextMenu?.(event, folder) : undefined}
                >
                  <td className={styles.listNameCell}>
                    <Folder size={16} className={styles.folderChipIcon} aria-hidden="true" />
                    <span className={styles.listNameText}>{folder.name}</span>
                  </td>
                  <td className={styles.listCell}>
                    {Number.isFinite(itemCount) ? `${itemCount} elemento${itemCount === 1 ? '' : 's'}` : '—'}
                  </td>
                  <td className={styles.listCell}>—</td>
                  <td className={styles.listCell}>—</td>
                  <td className={styles.listCell}>—</td>
                  <td className={styles.listActionsCell} onClick={(event) => event.stopPropagation()}>
                    {canWrite && (
                      <KebabMenu
                        label={`Más acciones de ${folder.name}`}
                        placement="bottom-end"
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
                    )}
                  </td>
                </tr>
              )
            })}

            {assets.map((asset, index) => {
              const thumb = assetImageUrl(asset, 64)
              const isSelected = selectedIds.has(asset.id)
              return (
                <tr
                  key={asset.id}
                  className={cx(styles.assetRow, isSelected && styles.assetRowSelected, isTrash && styles.assetRowTrashed)}
                  aria-selected={isSelected}
                  tabIndex={canWrite ? 0 : undefined}
                  draggable={canWrite && !isTrash}
                  onClick={canWrite ? (event) => handleAssetClick(event, asset.id) : undefined}
                  onDoubleClick={canWrite ? () => onOpenLightbox?.(index) : undefined}
                  onKeyDown={canWrite ? (event) => handleAssetKeyDown(event, asset.id, index) : undefined}
                  onDragStart={canWrite && !isTrash ? (event) => handleAssetDragStart(event, asset) : undefined}
                  onContextMenu={canWrite ? (event) => onAssetContextMenu?.(event, asset, index) : undefined}
                >
                  <td className={styles.listNameCell}>
                    <span className={styles.listCheckSlot} aria-hidden="true">
                      {isSelected && <Check size={12} strokeWidth={3} className={styles.listCheckIcon} />}
                    </span>
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" className={styles.listThumb} />
                    ) : (
                      <span className={styles.listThumbFallback} aria-hidden="true">
                        <Images size={14} />
                      </span>
                    )}
                    <span className={styles.listNameText}>{asset.file_name}</span>
                  </td>
                  <td className={styles.listCell}>{formatBytes(asset.file_size) || '—'}</td>
                  <td className={styles.listCell}>{formatDimensions(asset.width, asset.height)}</td>
                  <td className={styles.listCell}>{mimeLabel(asset.mime_type)}</td>
                  <td className={styles.listCell}>{formatDateEs(asset.created_at)}</td>
                  <td className={styles.listActionsCell} onClick={(event) => event.stopPropagation()}>
                    {canWrite && !isTrash && (
                      <KebabMenu
                        label={`Más acciones de ${asset.file_name}`}
                        placement="bottom-end"
                        triggerSize="sm"
                        items={assetKebabItems(asset)}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {effectiveLayout === 'grid' && assets.length > 0 && (
        <div className={styles.grid}>
          {assets.map((asset, index) => {
            const thumb = assetImageUrl(asset, 300)
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
                onContextMenu={canWrite ? (event) => onAssetContextMenu?.(event, asset, index) : undefined}
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
                        items={assetKebabItems(asset)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isFilteredToZero && (
        <EmptyState icon={Images} title="No hay imágenes de este tipo en esta carpeta" />
      )}
    </div>
  )
}
