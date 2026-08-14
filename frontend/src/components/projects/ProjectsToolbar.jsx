import { Archive, Building2, LayoutGrid, List, Move, Search, Trash2 } from 'lucide-react'
import { Button, Input, Select } from '../ui'
import MorphingToolbar from '../organizer/MorphingToolbar'
import { projectTypeLabel } from '../../lib/companyFormatters'
import styles from './ProjectsToolbar.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

// Sólo 3 combos "naturales" — a diferencia de la biblioteca, acá hay un
// único campo de fecha disponible (`lastActivity` = `updated_at`; no existe
// un `createdAt` separado en el payload de /api/companies/:id), así que
// "Recientes" y una eventual "Últ. edición" serían el mismo criterio
// repetido. Ver comentario en ProjectsPage.jsx (buildSortSelectValue) para
// cómo esto convive con las 3 columnas sorteables de la vista lista
// (Nombre/Tipo/Últ. edición) — "Tipo" no tiene combo en este Select, igual
// que Dimensiones/Formato no lo tienen en LibraryToolbar.
const SORT_OPTIONS = [
  { value: 'activity_desc', label: 'Recientes' },
  { value: 'name_asc', label: 'Nombre A-Z' },
  { value: 'name_desc', label: 'Nombre Z-A' },
]

// Tipos reales (grep en NewProject.jsx PROJECT_TYPES + backend validation
// "Valores aceptados: page, brief, document, faq") — el plan original
// listaba un 5º valor "Documento" que no existe: `document` YA mapea a
// "Artículo" en projectTypeLabel (companyFormatters.js), la misma función
// que arma el chip de tipo en las cards, así que las labels de este Select
// se derivan de ahí para que nunca diverjan del badge real.
const TYPE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'page', label: projectTypeLabel('page') },
  { value: 'document', label: projectTypeLabel('document') },
  { value: 'faq', label: projectTypeLabel('faq') },
  { value: 'brief', label: projectTypeLabel('brief') },
]

/**
 * Barra persistente que muta para ProjectsPage (Ola 2, O2.c) — mismo shell
 * `organizer/MorphingToolbar` que LibraryToolbar, mismo criterio de
 * slots: sin selección = búsqueda + orden + filtro de tipo (izquierda) +
 * toggle grid/lista (derecha, SIEMPRE visible, es preferencia de vista no
 * acción de selección); con selección = "N seleccionados" (izquierda) +
 * acciones bulk (derecha) — reemplaza la vieja `.bulkToolbar` sticky de
 * ProjectsPage, que se eliminó.
 *
 * No conoce la API — ProjectsPage pasa callbacks ya resueltos (mismos
 * handlers bulk existentes para Mover de empresa/Archivar/Papelera; sólo
 * "Mover a carpeta" es una acción nueva).
 */
export default function ProjectsToolbar({
  canOrganize = false,
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
  onMoveToFolder,
  onMoveCompany,
  onArchive,
  onTrash,
  onCancel,
}) {
  const hasSelection = selectionCount > 0 && canOrganize

  const leftContent = hasSelection ? (
    <strong className={styles.selectionInfo}>
      {selectionCount} proyecto{selectionCount === 1 ? '' : 's'} seleccionado{selectionCount === 1 ? '' : 's'}
    </strong>
  ) : (
    <>
      <Input
        type="search"
        fullWidth={false}
        icon={<Search size={16} />}
        aria-label="Buscar por nombre o cliente"
        placeholder="Buscar por nombre o cliente"
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
      <Select
        size="sm"
        fullWidth={false}
        aria-label="Filtrar por tipo"
        value={typeFilter}
        onChange={(event) => onTypeFilterChange?.(event.target.value)}
        options={TYPE_OPTIONS}
        className={styles.typeSelect}
      />
    </>
  )

  const rightContent = (
    <>
      {hasSelection && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Move size={14} />}
            onClick={onMoveToFolder}
            disabled={bulkBusy}
            aria-label={`Mover ${selectionCount} proyecto${selectionCount === 1 ? '' : 's'} seleccionado${selectionCount === 1 ? '' : 's'} a otra carpeta`}
          >
            Mover a carpeta
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Building2 size={14} />}
            onClick={onMoveCompany}
            disabled={bulkBusy}
            aria-label={`Mover ${selectionCount} proyecto${selectionCount === 1 ? '' : 's'} seleccionado${selectionCount === 1 ? '' : 's'} de empresa`}
          >
            Mover de empresa
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={<Archive size={14} />}
            onClick={onArchive}
            disabled={bulkBusy}
            aria-label={`Archivar ${selectionCount} proyecto${selectionCount === 1 ? '' : 's'} seleccionado${selectionCount === 1 ? '' : 's'}`}
          >
            Archivar
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            icon={<Trash2 size={14} />}
            onClick={onTrash}
            disabled={bulkBusy}
            aria-label={`Enviar ${selectionCount} proyecto${selectionCount === 1 ? '' : 's'} seleccionado${selectionCount === 1 ? '' : 's'} a la papelera`}
          >
            Papelera
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={bulkBusy} aria-label="Cancelar selección">
            Cancelar
          </Button>
        </>
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
    <MorphingToolbar selected={hasSelection} left={leftContent} right={rightContent} label="Herramientas de proyectos" />
  )
}
