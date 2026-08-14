import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Archive, Building2, Check, Folder, FolderOpen, Move, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button, KebabMenu } from '../ui'
import EmptyState from '../onboarding/EmptyState'
import { formatRelativeDate, projectTypeLabel } from '../../lib/companyFormatters'
import {
  FOLDER_DRAG_TYPE, PROJECT_DRAG_TYPE, FOLDER_ICON_MARKUP, PROJECT_ICON_MARKUP,
  createItemDragGhost, dragHasAnyType, isInternalDragLeave,
} from '../organizer/dnd'
import styles from './ProjectGrid.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const EMPTY_SELECTION = new Set()

// Debajo de este ancho, la vista lista se fuerza a grilla — mismo criterio
// y mismo breakpoint que AssetGrid.jsx (components/library/), ver el
// comentario ahí para el porqué de 720px.
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
 * Carpetas + proyectos para ProjectsPage (Ola 2, O2.c) — misma gramática
 * que `library/AssetGrid.jsx`: chips de carpeta arriba del grid (o filas
 * "on top" de la tabla en vista lista), DnD nativo (mime types de
 * `organizer/dnd.js`), right-click delegado al caller.
 *
 * Diferencia deliberada de interacción (documentada porque el plan O2.c la
 * pide explícita): las CARDS de grilla NO adoptan el modelo "un click
 * togglea selección" de AssetGrid. Los project cards tienen botones
 * internos (Abrir/Duplicar) que competirían con un click-to-select global,
 * y ProjectsPage ya tenía su propio hábito ANTES de esta ola (checkbox +
 * click-toggle SOLO en select-mode, ver `handleCardActivate` abajo) — se
 * conserva tal cual por ser el comportamiento estable de esta página. La
 * VISTA LISTA, en cambio, es 100% nueva (no existía ningún hábito previo)
 * y sus filas no tienen botones internos que compitan, así que sí adopta
 * el modelo de Library: click togglea selección siempre, dblclick abre.
 */
export default function ProjectGrid({
  folders = [],
  projects = [],
  // Proyectos + subcarpetas dentro de la carpeta actual, ANTES de
  // búsqueda/filtro de tipo — permite distinguir "la carpeta está vacía" de
  // "la búsqueda/filtro no matchea nada", igual que `totalAssetCount` en
  // AssetGrid.
  totalInFolderCount,
  isRoot = true,
  layout = 'grid',
  sortField = 'activity',
  sortDir = 'desc',
  onSortFieldClick,
  // `canOrganize` = canManageProjects && !company.isInternal — gatea
  // checkbox/kebab/drag/right-click de las CARDS de proyecto (invariante
  // O2.c: WeBrief interna nunca las muestra). `canManageProjects` (sin el
  // segundo gate) sigue controlando lo que YA gateaba antes de esta ola —
  // sólo el botón "Duplicar" — porque el invariante explícito del plan
  // sólo lista "menú/drag/checkbox/kebab", no el botón de duplicar
  // (comportamiento estable pre-existente, no se toca). `canManageFolders`
  // es un TERCER gate, deliberadamente distinto de `canManageProjects`: el
  // backend autoriza carpetas con una regla más estricta (resolveCompanyRole
  // en folderTree.js exige rol manager/editor; un 'admin' de EMPRESA — no
  // platform admin — NO califica ahí aunque sí califique para
  // canManageProjects) — ver el comentario junto a su cómputo en
  // ProjectsPage.jsx. Gatea TODO lo de carpetas: chip/fila draggable,
  // kebab, right-click.
  canOrganize = false,
  canManageProjects = false,
  canManageFolders = false,
  canCreateProjects = false,
  selectedIds = EMPTY_SELECTION,
  onToggleSelect,
  onOpenProject,
  onDuplicateProject,
  onMoveProjectToFolder,
  onMoveProjectCompany,
  onArchiveProject,
  onTrashProject,
  onCreateProject,
  onOpenFolder,
  onRenameFolder,
  onMoveFolder,
  onDeleteFolder,
  onDropProjects,
  onDropFolder,
  onProjectContextMenu,
  onFolderContextMenu,
}) {
  const inSelectMode = selectedIds.size > 0
  const isNarrowViewport = useIsNarrowViewport(LIST_FORCE_GRID_BREAKPOINT)
  const effectiveLayout = isNarrowViewport ? 'grid' : layout
  const [dragOverFolderId, setDragOverFolderId] = useState(null)
  // Origen del drag activo (F1.2-B punto 1b) — mismo criterio que
  // AssetGrid.jsx: atenúa (opacity .5) el/los item(s) que se están
  // arrastrando, quitado en dragend.
  const [draggingProjectIds, setDraggingProjectIds] = useState(EMPTY_SELECTION)
  const [draggingFolderId, setDraggingFolderId] = useState(null)

  // ── Activación de carpetas ────────────────────────────────────────────
  // Un click sobre un folder chip/fila mientras hay proyectos seleccionados
  // es un no-op (no navega) para no "perder" la selección por accidente —
  // mismo criterio que AssetGrid.handleFolderActivate.
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

  // Arrastrar la carpeta COMO FUENTE (levantarla) requiere poder
  // reparentarla — canManageFolders específicamente, no canOrganize.
  function handleFolderDragStart(event, folder) {
    if (!canManageFolders) {
      event.preventDefault()
      return
    }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(FOLDER_DRAG_TYPE, folder.id)
    setDraggingFolderId(folder.id)
    const ghost = createItemDragGhost({ label: folder.name, iconMarkup: FOLDER_ICON_MARKUP })
    event.dataTransfer.setDragImage(ghost, 20, 20)
    window.setTimeout(() => ghost.remove(), 0)
  }

  function handleFolderDragEnd() {
    setDragOverFolderId(null)
    setDraggingFolderId(null)
  }

  // Un chip/fila de carpeta COMO DESTINO puede recibir un PROJECT_DRAG_TYPE
  // (gate real: canOrganize) o un FOLDER_DRAG_TYPE (gate real:
  // canManageFolders) — acepta el dragover si CUALQUIERA de los dos
  // aplica; qué payload es realmente el que llegó (y su gate específico) se
  // resuelve en handleFolderDrop.
  function handleFolderDragOver(event, folder) {
    if (!canOrganize && !canManageFolders) return
    if (!dragHasAnyType(event, [PROJECT_DRAG_TYPE, FOLDER_DRAG_TYPE])) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dragOverFolderId !== folder.id) setDragOverFolderId(folder.id)
  }

  function handleFolderDragLeave(event, folderId) {
    if (isInternalDragLeave(event)) return
    setDragOverFolderId((current) => (current === folderId ? null : current))
  }

  function handleFolderDrop(event, folder) {
    event.preventDefault()
    event.stopPropagation()
    setDragOverFolderId(null)
    const projectsPayload = event.dataTransfer.getData(PROJECT_DRAG_TYPE)
    if (projectsPayload) {
      if (!canOrganize) return
      let ids = []
      try {
        ids = JSON.parse(projectsPayload)
      } catch {
        ids = []
      }
      if (Array.isArray(ids) && ids.length) onDropProjects?.(ids, folder.id)
      return
    }
    if (!canManageFolders) return
    const draggedFolderId = event.dataTransfer.getData(FOLDER_DRAG_TYPE)
    // Una carpeta no puede droppearse sobre sí misma.
    if (draggedFolderId && draggedFolderId !== folder.id) {
      onDropFolder?.(draggedFolderId, folder.id)
    }
  }

  function folderKebabItems(folder) {
    return [
      { label: 'Renombrar', icon: <Pencil size={14} />, onClick: () => onRenameFolder?.(folder) },
      { label: 'Mover', icon: <Move size={14} />, onClick: () => onMoveFolder?.(folder) },
      {
        label: 'Eliminar',
        icon: <Trash2 size={14} />,
        destructive: true,
        onClick: () => onDeleteFolder?.(folder),
      },
    ]
  }

  // ── Activación / selección de proyectos (grilla) ───────────────────────
  // Ver el comentario de cabecera del archivo — este es el modelo EXISTENTE
  // de ProjectsPage (no el de Library), conservado a propósito.
  function handleCardActivate(projectId) {
    if (inSelectMode) onToggleSelect?.(projectId)
    else onOpenProject?.(projectId)
  }

  function handleCardKeyDown(event, projectId) {
    if (event.target.closest?.('button')) return
    if (event.target.closest?.('input, label, [role="menu"]')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleCardActivate(projectId)
    }
  }

  // ── Activación / selección de proyectos (lista) ────────────────────────
  // Modelo Library: click SIEMPRE togglea, dblclick SIEMPRE abre — no hay
  // botones internos en una fila de tabla que compitan por el click, así
  // que no hace falta el "select-mode" condicional de las cards. El toggle
  // (click/Space) queda gateado por `canOrganize` — mismo criterio que
  // AssetGrid, que gatea el onClick de la fila entero por `canWrite`: un
  // usuario de sólo lectura NO debería poder poblar `selectedIds` (el
  // toolbar sólo muestra el modo selección cuando `canOrganize` es true —
  // sin este guard, sus filas quedarían "seleccionadas" con highlight pero
  // sin ningún botón bulk visible para actuar ni cancelar salvo ESC).
  // Abrir (dblclick/Enter) SÍ queda disponible para cualquier usuario,
  // igual que el botón "Abrir" de las cards de grilla no tiene gate.
  function handleRowClick(event, projectId) {
    if (!canOrganize) return
    if (event.detail > 1) return
    onToggleSelect?.(projectId)
  }

  function handleRowKeyDown(event, projectId) {
    if (event.target.closest?.('button, [role="menu"]')) return
    if (event.key === 'Enter') {
      event.preventDefault()
      onOpenProject?.(projectId)
    } else if (event.key === ' ' && canOrganize) {
      event.preventDefault()
      onToggleSelect?.(projectId)
    }
  }

  function handleProjectDragStart(event, project) {
    if (!canOrganize) {
      event.preventDefault()
      return
    }
    const ids = selectedIds.has(project.id) && selectedIds.size > 0 ? Array.from(selectedIds) : [project.id]
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(PROJECT_DRAG_TYPE, JSON.stringify(ids))
    setDraggingProjectIds(new Set(ids))
    // Los proyectos nunca tienen miniatura (a diferencia de los assets) —
    // siempre ícono de fallback, nunca clone de <img>.
    const ghost = createItemDragGhost({ label: project.name, iconMarkup: PROJECT_ICON_MARKUP, count: ids.length })
    event.dataTransfer.setDragImage(ghost, 20, 20)
    window.setTimeout(() => ghost.remove(), 0)
  }

  function handleProjectDragEnd() {
    setDraggingProjectIds(EMPTY_SELECTION)
  }

  function projectKebabItems(project) {
    return [
      { label: 'Mover a carpeta', icon: <Move size={14} />, onClick: () => onMoveProjectToFolder?.([project.id]) },
      { label: 'Mover de empresa', icon: <Building2 size={14} />, onClick: () => onMoveProjectCompany?.([project.id]) },
      { label: 'Archivar', icon: <Archive size={14} />, onClick: () => onArchiveProject?.(project.id) },
      {
        label: 'Enviar a papelera',
        icon: <Trash2 size={14} />,
        destructive: true,
        onClick: () => onTrashProject?.(project.id),
      },
    ]
  }

  const showFolders = folders.length > 0
  const hasListContent = showFolders || projects.length > 0

  // Empty states — tres niveles, igual espíritu que AssetGrid pero
  // adaptado a que acá los datos ya vienen resueltos client-side (no hay
  // vuelta al server por carpeta):
  //   1) raíz sin NADA (0 proyectos Y 0 carpetas en toda la empresa) → CTA
  //      grande. Deliberadamente NO se dispara con sólo "0 proyectos" —
  //      una empresa puede tener carpetas creadas de antemano sin
  //      proyectos todavía, y esas carpetas deben seguir navegables en vez
  //      de quedar tapadas por el CTA de "crear el primero".
  //   2) carpeta (no raíz) sin contenido propio (0 proyectos y 0
  //      subcarpetas) → mensaje liviano, sin CTA (crear proyecto siempre
  //      cae en la raíz, ver ProjectsPage.jsx — no tiene sentido ofrecer
  //      esa acción acá dando a entender que aterriza en ESTA carpeta).
  //   3) búsqueda/filtro de tipo sin resultados dentro de una carpeta con
  //      contenido → mensaje liviano distinto.
  const isFullyEmpty = Number.isFinite(totalInFolderCount) && totalInFolderCount === 0
  // Mismo criterio que AssetGrid.isFilteredToZero: compara la lista YA
  // filtrada (`projects`, post búsqueda/tipo) contra el total PRE-filtro de
  // la carpeta — independiente de si hay chips de carpeta visibles, para
  // que el aviso "sin resultados" aparezca DEBAJO de ellas en vez de
  // ocultarse porque `hasListContent` es true por las subcarpetas solas.
  const isFilteredToZero = !isFullyEmpty && projects.length === 0 && totalInFolderCount > 0

  if (isFullyEmpty && isRoot) {
    return (
      <EmptyState
        icon={Folder}
        title="Todavía no hay proyectos en esta empresa"
        body="Crea el primero para empezar a colaborar con tu equipo y compartir avances con clientes."
        cta={canCreateProjects ? { label: 'Nuevo proyecto', onClick: onCreateProject } : null}
      />
    )
  }

  if (isFullyEmpty) {
    return <EmptyState icon={Folder} title="Esta carpeta está vacía" />
  }

  return (
    <div className={styles.wrap}>
      {effectiveLayout === 'grid' && showFolders && (
        <div className={styles.folderSection}>
          <p className={styles.folderSectionTitle}>Carpetas</p>
          <div className={styles.folderChipRow}>
            {folders.map((folder) => (
              <div
                key={folder.id}
                role="button"
                tabIndex={0}
                draggable={canManageFolders}
                aria-label={folder.name}
                className={cx(
                  styles.folderChip,
                  dragOverFolderId === folder.id && styles.folderChipDragOver,
                  draggingFolderId === folder.id && styles.dragSourceDimmed
                )}
                onClick={() => handleFolderActivate(folder.id)}
                onKeyDown={(event) => handleFolderKeyDown(event, folder.id)}
                onDragStart={(event) => handleFolderDragStart(event, folder)}
                onDragOver={(event) => handleFolderDragOver(event, folder)}
                onDragLeave={(event) => handleFolderDragLeave(event, folder.id)}
                onDrop={(event) => handleFolderDrop(event, folder)}
                onDragEnd={handleFolderDragEnd}
                onContextMenu={canManageFolders ? (event) => onFolderContextMenu?.(event, folder) : undefined}
              >
                <Folder size={16} className={styles.folderChipIcon} aria-hidden="true" />
                <span className={styles.folderChipName}>{folder.name}</span>
                {Number.isFinite(folder.projectCount) && (
                  <span className={styles.folderChipCount}>{folder.projectCount}</span>
                )}
                {canManageFolders && (
                  <div className={styles.folderChipKebab} onClick={(event) => event.stopPropagation()}>
                    <KebabMenu
                      label={`Más acciones de ${folder.name}`}
                      placement="bottom-start"
                      triggerSize="sm"
                      items={folderKebabItems(folder)}
                    />
                  </div>
                )}
              </div>
            ))}
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
              <th scope="col" aria-sort={ariaSortValue('type', sortField, sortDir)}>
                <button type="button" className={styles.sortHeaderBtn} onClick={() => onSortFieldClick?.('type')}>
                  Tipo {sortIndicator('type', sortField, sortDir)}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSortValue('activity', sortField, sortDir)}>
                <button type="button" className={styles.sortHeaderBtn} onClick={() => onSortFieldClick?.('activity')}>
                  Últ. edición {sortIndicator('activity', sortField, sortDir)}
                </button>
              </th>
              <th scope="col" className={styles.listActionsHeader}>
                <span className={styles.srOnly}>Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {showFolders && folders.map((folder) => (
              <tr
                key={folder.id}
                className={cx(
                  styles.folderRow,
                  dragOverFolderId === folder.id && styles.folderRowDragOver,
                  draggingFolderId === folder.id && styles.dragSourceDimmed
                )}
                tabIndex={0}
                aria-label={folder.name}
                draggable={canManageFolders}
                onClick={() => handleFolderActivate(folder.id)}
                onKeyDown={(event) => handleFolderKeyDown(event, folder.id)}
                onDragStart={(event) => handleFolderDragStart(event, folder)}
                onDragOver={(event) => handleFolderDragOver(event, folder)}
                onDragLeave={(event) => handleFolderDragLeave(event, folder.id)}
                onDrop={(event) => handleFolderDrop(event, folder)}
                onDragEnd={handleFolderDragEnd}
                onContextMenu={canManageFolders ? (event) => onFolderContextMenu?.(event, folder) : undefined}
              >
                <td className={styles.listNameCell}>
                  <Folder size={16} className={styles.listFolderIcon} aria-hidden="true" />
                  <span className={styles.listNameText}>{folder.name}</span>
                </td>
                <td className={styles.listCell}>—</td>
                <td className={styles.listCell}>
                  {Number.isFinite(folder.projectCount) ? `${folder.projectCount} proyecto${folder.projectCount === 1 ? '' : 's'}` : '—'}
                </td>
                <td className={styles.listActionsCell} onClick={(event) => event.stopPropagation()}>
                  {canManageFolders && (
                    <KebabMenu
                      label={`Más acciones de ${folder.name}`}
                      placement="bottom-end"
                      triggerSize="sm"
                      items={folderKebabItems(folder)}
                    />
                  )}
                </td>
              </tr>
            ))}

            {projects.map((project) => {
              const isSelected = selectedIds.has(project.id)
              return (
                <tr
                  key={project.id}
                  className={cx(
                    styles.projectRow,
                    isSelected && styles.projectRowSelected,
                    draggingProjectIds.has(project.id) && styles.dragSourceDimmed
                  )}
                  aria-selected={isSelected}
                  tabIndex={0}
                  draggable={canOrganize}
                  onClick={(event) => handleRowClick(event, project.id)}
                  onDoubleClick={() => onOpenProject?.(project.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, project.id)}
                  onDragStart={canOrganize ? (event) => handleProjectDragStart(event, project) : undefined}
                  onDragEnd={canOrganize ? handleProjectDragEnd : undefined}
                  onContextMenu={canOrganize ? (event) => onProjectContextMenu?.(event, project) : undefined}
                >
                  <td className={styles.listNameCell}>
                    <span className={styles.listCheckSlot} aria-hidden="true">
                      {isSelected && <Check size={12} strokeWidth={3} className={styles.listCheckIcon} />}
                    </span>
                    <FolderOpen size={16} className={styles.listProjectIcon} aria-hidden="true" />
                    <span className={styles.listNameText}>{project.name}</span>
                  </td>
                  <td className={styles.listCell}>{projectTypeLabel(project.projectType)}</td>
                  <td className={styles.listCell}>{formatRelativeDate(project.lastActivity)}</td>
                  <td className={styles.listActionsCell} onClick={(event) => event.stopPropagation()}>
                    {canOrganize && (
                      <KebabMenu
                        label={`Más acciones de ${project.name}`}
                        placement="bottom-end"
                        triggerSize="sm"
                        items={projectKebabItems(project)}
                      />
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {effectiveLayout === 'grid' && (projects.length > 0 || canCreateProjects) && (
        <div className={styles.projectGrid}>
          {projects.map((project) => {
            const isSelected = selectedIds.has(project.id)
            const cardClassNames = [styles.projectCard]
            if (isSelected) cardClassNames.push(styles.projectCardSelected)
            if (inSelectMode) cardClassNames.push(styles.projectCardInSelectMode)
            if (draggingProjectIds.has(project.id)) cardClassNames.push(styles.dragSourceDimmed)
            return (
              <article
                key={project.id}
                className={cardClassNames.join(' ')}
                role="button"
                tabIndex={0}
                draggable={canOrganize}
                aria-selected={isSelected ? 'true' : undefined}
                onClick={() => handleCardActivate(project.id)}
                onKeyDown={(event) => handleCardKeyDown(event, project.id)}
                onDragStart={canOrganize ? (event) => handleProjectDragStart(event, project) : undefined}
                onDragEnd={canOrganize ? handleProjectDragEnd : undefined}
                onContextMenu={canOrganize ? (event) => onProjectContextMenu?.(event, project) : undefined}
              >
                {canOrganize && (
                  <label
                    className={styles.projectSelectLabel}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      className={styles.projectSelectCheckbox}
                      checked={isSelected}
                      onChange={() => onToggleSelect?.(project.id)}
                      aria-label={isSelected ? `Deseleccionar ${project.name}` : `Seleccionar ${project.name}`}
                    />
                  </label>
                )}

                <div className={styles.projectTop}>
                  <span className={styles.projectTypeChip}>
                    {projectTypeLabel(project.projectType)}
                  </span>
                </div>

                <div className={styles.projectBody}>
                  <h3 className={styles.projectName}>{project.name}</h3>
                  <p className={styles.projectTimestamp}>
                    Editado {formatRelativeDate(project.lastActivity)}
                  </p>
                </div>

                <div className={styles.projectActions}>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenProject?.(project.id)
                    }}
                  >
                    Abrir
                  </Button>
                  {canManageProjects && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation()
                        onDuplicateProject?.(project.id)
                      }}
                    >
                      Duplicar
                    </Button>
                  )}
                  {canOrganize && (
                    <div
                      className={styles.projectKebabSlot}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <KebabMenu
                        label={`Más acciones de ${project.name}`}
                        placement="top-end"
                        items={projectKebabItems(project)}
                      />
                    </div>
                  )}
                </div>
              </article>
            )
          })}
          {canCreateProjects && (
            <button
              type="button"
              className={styles.addProjectCard}
              data-tour="create-project-card"
              onClick={onCreateProject}
            >
              <Plus size={20} />
              <span>Nuevo proyecto</span>
            </button>
          )}
        </div>
      )}

      {isFilteredToZero && (
        <EmptyState icon={Folder} title="No se encontraron proyectos" body="Prueba con otro texto de búsqueda o quita el filtro de tipo." />
      )}
    </div>
  )
}
