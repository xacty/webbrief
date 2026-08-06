import { Download, LayoutGrid, List, Move, RotateCcw, Search, Trash2 } from 'lucide-react'
import { Button, Input, Select } from '../ui'
import MorphingToolbar from '../organizer/MorphingToolbar'
import styles from './LibraryToolbar.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const SORT_OPTIONS = [
  { value: 'name_asc', label: 'Nombre A-Z' },
  { value: 'name_desc', label: 'Nombre Z-A' },
  { value: 'date_desc', label: 'Más recientes' },
  { value: 'date_asc', label: 'Más antiguas' },
  { value: 'size_desc', label: 'Mayor tamaño' },
]

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'photo', label: 'Fotos' },
  { value: 'png', label: 'PNG' },
  { value: 'svg', label: 'SVG' },
  { value: 'gif', label: 'GIF' },
]

/**
 * Barra persistente que muta (iteración UX F1, punto 3). El shell en sí
 * (una sola barra siempre montada entre el header y el contenido, con
 * `min-height` fija — nunca se desmonta/remonta, así que no hay reflow del
 * grid al entrar/salir de selección) vive en `organizer/MorphingToolbar`
 * desde O2.a; este componente sólo decide QUÉ va en cada slot. Sin
 * selección muestra orden + filtro de tipo (o "Vaciar papelera" en la
 * vista papelera); con selección, el lado izquierdo cambia a "N
 * seleccionadas" y el derecho a las acciones bulk — MISMO shell, sólo
 * cambia el contenido de los dos slots (`left` / `right` de
 * MorphingToolbar).
 *
 * El toggle Grid/Lista (punto 6) vive siempre en el extremo derecho, en
 * cualquier modo (selección o no, papelera o no) — es una preferencia de
 * vista persistente (`localStorage`), no una acción de selección, así que
 * no tiene sentido que desaparezca cuando el usuario selecciona algo.
 *
 * No conoce la API — LibraryPage pasa callbacks ya resueltos (igual patrón
 * que MoveToFolderModal/RenameModal: este componente sólo posee el layout
 * y delega toda mutación hacia arriba).
 *
 * Búsqueda (F1.2-B, punto 2): nueva — antes esta barra no tenía search.
 * Mismo patrón client-side que ProjectsToolbar (debounce vive en
 * LibraryPage, acá sólo el input controlado), filtra por nombre de archivo
 * dentro de la carpeta/vista actual. Compacta a la altura de los Select
 * `size="sm"` contiguos vía `.searchField input` en el CSS module — ver
 * comentario ahí para el porqué (Input por defecto mide 40px, los Select
 * de esta barra 32px).
 */
export default function LibraryToolbar({
  isTrash = false,
  canWrite = false,
  selectionCount = 0,
  bulkBusy = false,
  searchValue = '',
  onSearchChange,
  sortValue,
  onSortChange,
  typeFilter = 'all',
  onTypeFilterChange,
  layout = 'grid',
  onLayoutChange,
  onMove,
  onExport,
  onTrash,
  onRestore,
  onCancel,
  onEmptyTrash,
  emptyTrashDisabled = false,
}) {
  const hasSelection = selectionCount > 0 && canWrite

  const leftContent = hasSelection ? (
    <strong className={styles.selectionInfo}>
      {selectionCount} imagen{selectionCount === 1 ? '' : 'es'} seleccionada{selectionCount === 1 ? '' : 's'}
    </strong>
  ) : (
    <>
      <Input
        type="search"
        fullWidth={false}
        icon={<Search size={16} />}
        aria-label="Buscar por nombre de archivo"
        placeholder="Buscar por nombre de archivo"
        value={searchValue}
        onChange={(event) => onSearchChange?.(event.target.value)}
        className={styles.searchField}
      />
      <Select
        size="sm"
        fullWidth={false}
        aria-label="Ordenar por"
        placeholder="Ordenar"
        value={sortValue}
        onChange={(event) => onSortChange?.(event.target.value)}
        options={SORT_OPTIONS}
        className={styles.sortSelect}
      />
      {!isTrash && (
        <Select
          size="sm"
          fullWidth={false}
          aria-label="Filtrar por tipo"
          value={typeFilter}
          onChange={(event) => onTypeFilterChange?.(event.target.value)}
          options={TYPE_OPTIONS}
          className={styles.typeSelect}
        />
      )}
    </>
  )

  const rightContent = (
    <>
      {hasSelection && (
        isTrash ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<RotateCcw size={14} />}
              onClick={onRestore}
              disabled={bulkBusy}
              aria-label={`Restaurar ${selectionCount} ${selectionCount === 1 ? 'imagen' : 'imágenes'} seleccionada${selectionCount === 1 ? '' : 's'}`}
            >
              Restaurar seleccionadas
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={bulkBusy} aria-label="Cancelar selección">
              Cancelar
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Move size={14} />}
              onClick={onMove}
              disabled={bulkBusy}
              aria-label={`Mover ${selectionCount} ${selectionCount === 1 ? 'imagen' : 'imágenes'} seleccionada${selectionCount === 1 ? '' : 's'} a otra carpeta`}
            >
              Mover
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<Download size={14} />}
              onClick={onExport}
              disabled={bulkBusy}
              aria-label={`Exportar ${selectionCount} ${selectionCount === 1 ? 'imagen' : 'imágenes'} seleccionada${selectionCount === 1 ? '' : 's'}`}
            >
              Exportar
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              icon={<Trash2 size={14} />}
              onClick={onTrash}
              disabled={bulkBusy}
              aria-label={`Enviar ${selectionCount} ${selectionCount === 1 ? 'imagen' : 'imágenes'} seleccionada${selectionCount === 1 ? '' : 's'} a la papelera`}
            >
              Papelera
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={bulkBusy} aria-label="Cancelar selección">
              Cancelar
            </Button>
          </>
        )
      )}

      {!hasSelection && isTrash && canWrite && (
        <Button
          type="button"
          variant="danger"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={onEmptyTrash}
          disabled={emptyTrashDisabled}
        >
          Vaciar papelera
        </Button>
      )}

      <div className={styles.layoutToggle} role="group" aria-label="Tipo de vista">
        <button
          type="button"
          className={cx(styles.layoutButton, layout === 'grid' && styles.layoutButtonActive)}
          aria-pressed={layout === 'grid'}
          aria-label="Vista de cuadrícula"
          onClick={() => onLayoutChange?.('grid')}
        >
          <LayoutGrid size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={cx(styles.layoutButton, layout === 'list' && styles.layoutButtonActive)}
          aria-pressed={layout === 'list'}
          aria-label="Vista de lista"
          onClick={() => onLayoutChange?.('list')}
        >
          <List size={16} aria-hidden="true" />
        </button>
      </div>
    </>
  )

  return (
    <MorphingToolbar selected={hasSelection} left={leftContent} right={rightContent} label="Herramientas de biblioteca" />
  )
}
