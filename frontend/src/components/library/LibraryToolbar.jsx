import { Download, LayoutGrid, List, Move, RotateCcw, Trash2 } from 'lucide-react'
import { Button, Select } from '../ui'
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
 * Barra persistente que muta (iteración UX F1, punto 3). UNA sola barra,
 * siempre montada entre el header y el contenido, con `min-height` fija —
 * nunca se desmonta/remonta, así que no hay reflow del grid al entrar/salir
 * de selección (antes la vieja `.bulkToolbar` de LibraryPage aparecía y
 * desaparecía condicionalmente, empujando el contenido). Sin selección
 * muestra orden + filtro de tipo (o "Vaciar papelera" en la vista papelera);
 * con selección, el lado izquierdo cambia a "N seleccionadas" y el derecho
 * a las acciones bulk — MISMO shell, sólo cambia el contenido de los dos
 * slots (`.left` / `.right`).
 *
 * El toggle Grid/Lista (punto 6) vive siempre en el extremo derecho, en
 * cualquier modo (selección o no, papelera o no) — es una preferencia de
 * vista persistente (`localStorage`), no una acción de selección, así que
 * no tiene sentido que desaparezca cuando el usuario selecciona algo.
 *
 * No conoce la API — LibraryPage pasa callbacks ya resueltos (igual patrón
 * que MoveToFolderModal/RenameModal: este componente sólo posee el layout
 * y delega toda mutación hacia arriba).
 */
export default function LibraryToolbar({
  isTrash = false,
  canWrite = false,
  selectionCount = 0,
  bulkBusy = false,
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

  return (
    <div className={cx(styles.bar, hasSelection && styles.barSelected)} role="toolbar" aria-label="Herramientas de biblioteca">
      <div className={styles.left}>
        {hasSelection ? (
          <strong className={styles.selectionInfo}>
            {selectionCount} imagen{selectionCount === 1 ? '' : 'es'} seleccionada{selectionCount === 1 ? '' : 's'}
          </strong>
        ) : (
          <>
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
        )}
      </div>

      <div className={styles.right}>
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
      </div>
    </div>
  )
}
