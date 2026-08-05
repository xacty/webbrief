import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Archive, Building2, ChevronRight, Copy, ExternalLink, FolderOpen, FolderPlus, Move, Pencil, Plus, Trash2, XCircle,
} from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { apiFetch } from '../../lib/api'
import { readCompanyCache, writeCompanyCache, clearCompaniesCache } from '../../lib/companyCache'
import { projectTypeLabel } from '../../lib/companyFormatters'
import {
  canCreateProjects as canCreateProjectsForRole,
  canManageProjectLifecycle as canManageProjectLifecycleForRole,
  isAdmin,
} from '../../lib/roleCapabilities'
import { getCompanyRoleLabel as getCompanyRoleLabelShared, getPlatformRoleTitle } from '../../../../shared/userRoles.js'
import { fetchProjectFolders, moveProjectsToFolder, updateProjectFolder } from '../../lib/projectFoldersApi'
import { compareStrings, compareDates, sortWithDirection } from '../../components/organizer/sorting'
import { FOLDER_DRAG_TYPE, PROJECT_DRAG_TYPE, isInternalDragLeave } from '../../components/organizer/dnd'
import { Button, Badge } from '../../components/ui'
import MoveToCompanyModal from '../../components/MoveToCompanyModal'
import ProjectsToolbar from '../../components/projects/ProjectsToolbar'
import ProjectGrid from '../../components/projects/ProjectGrid'
import NewProjectFolderModal from '../../components/projects/NewProjectFolderModal'
import RenameProjectFolderModal from '../../components/projects/RenameProjectFolderModal'
import MoveProjectsToFolderModal from '../../components/projects/MoveProjectsToFolderModal'
import DeleteProjectFolderModal from '../../components/projects/DeleteProjectFolderModal'
import ItemContextMenu from '../../components/organizer/ItemContextMenu'
import ActionToast from '../../components/organizer/ActionToast'
import styles from './workspace.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

function getCompanyRoleLabel(currentUser, membershipRole) {
  if (currentUser?.platformRole === 'admin') return getPlatformRoleTitle(currentUser.platformRole)
  return getCompanyRoleLabelShared(membershipRole)
}

const LAYOUT_STORAGE_KEY = 'wb:projects:layout'

function readStoredLayout() {
  if (typeof window === 'undefined') return 'grid'
  try {
    return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

// Combos "naturales" que el Select de orden expone directamente — ver el
// comentario en ProjectsToolbar.jsx (sólo 3, no hay un campo de fecha
// separado para "Últ. edición"). La columna "Tipo" de la vista lista es
// sorteable pero cae fuera de este set — igual que dimensions/format en la
// biblioteca, el Select simplemente muestra su placeholder en ese caso.
const SORT_SELECT_KEYS = new Set(['activity_desc', 'name_asc', 'name_desc'])

function compareProjectsBy(a, b, field) {
  if (field === 'name') return compareStrings(a.name, b.name)
  if (field === 'type') return compareStrings(projectTypeLabel(a.projectType), projectTypeLabel(b.projectType))
  return compareDates(a.lastActivity, b.lastActivity) // 'activity'
}

/**
 * Proyectos de una empresa — Ola 2 (O2.c): carpetas, búsqueda, filtro de
 * tipo, orden, vista lista y drag & drop, reusando la gramática de
 * LibraryPage/AssetGrid (ver DESIGN-SYSTEM.md §"Biblioteca de imágenes").
 * Orquestador: carga empresa+proyectos (existente, cache sessionStorage) +
 * carpetas de proyecto (nuevo, sin cache — ver fetchProjectFolders), arma
 * el filtrado/orden client-side sobre la lista ya cargada, y delega
 * render a ProjectsToolbar (barra que muta) + ProjectGrid (chips + grid/
 * lista + DnD).
 *
 * Diferencia deliberada de modelo de selección — ver el comentario de
 * cabecera de ProjectGrid.jsx: las cards de grilla conservan el hábito
 * EXISTENTE de esta página (checkbox + click-toggle sólo en select-mode),
 * NO el modelo "click siempre selecciona" de la biblioteca. Sólo la vista
 * lista (100% nueva) adopta ese modelo.
 */
export default function ProjectsPage() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { currentCompany, refresh: refreshWorkspace } = useWorkspace()
  const companyId = currentCompany?.id

  const [searchParams, setSearchParams] = useSearchParams()
  const folderId = searchParams.get('folderId')

  const cachedCompany = companyId ? readCompanyCache(companyId) : null
  const [company, setCompany] = useState(() => cachedCompany?.company || null)
  const [projects, setProjects] = useState(() => cachedCompany?.projects || [])
  const [members, setMembers] = useState(() => cachedCompany?.members || [])
  const [loading, setLoading] = useState(() => !cachedCompany?.company)
  const [error, setError] = useState('')

  // "Mover de empresa" — EXISTENTE, sin cambios de semántica (plan O2.c:
  // "REUSA los handlers bulk existentes tal cual"). Nombres conservados
  // para minimizar el diff sobre lo que ya funcionaba.
  const [moveModalIds, setMoveModalIds] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [feedbackNotice, setFeedbackNotice] = useState('')

  // Carpetas de proyecto (nuevo, O2.c) — lista plana de TODA la empresa
  // (igual que `allFolders` en la biblioteca); sin cache sessionStorage
  // propia (a diferencia de company/projects/members) — es una lista
  // chica y el árbol se recalcula client-side en cada fetch. `foldersRole`
  // viene del backend (GET /project-folders → { folders, role }) — ver
  // `canManageFolders` más abajo para el porqué de NO derivarlo de
  // `canManageProjects` como el resto de la página.
  const [folders, setFolders] = useState([])
  const [foldersRole, setFoldersRole] = useState(null)
  const [foldersLoadState, setFoldersLoadState] = useState('loading')

  // Carpetas — crear/renombrar/mover/eliminar.
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  const [renameFolderTarget, setRenameFolderTarget] = useState(null) // folder | null
  const [deleteFolderTarget, setDeleteFolderTarget] = useState(null) // folder | null
  // Mover a carpeta (proyectos O carpeta) — un solo modal reusado con dos
  // `kind`, mismo patrón que `moveState` en LibraryPage.jsx.
  const [moveState, setMoveState] = useState(null) // { kind: 'projects', ids } | { kind: 'folder', folder } | null

  // Búsqueda (debounce 200ms, client-side) + orden + filtro de tipo +
  // layout — mismo criterio que la iteración UX F1 de la biblioteca:
  // estado LOCAL (no URL), `layout` persiste en localStorage.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState('activity')
  const [sortDir, setSortDir] = useState('desc')
  const [typeFilter, setTypeFilter] = useState('all')
  const [layout, setLayout] = useState(readStoredLayout)

  // Toast flotante con Deshacer — SOLO para "mover a carpeta" (proyectos).
  // Mover una CARPETA (reparentar) y eliminar carpeta usan el banner
  // `feedbackNotice` existente en vez del toast — ver el comentario en
  // moveFolderAndNotify más abajo para el porqué de esta asimetría.
  const [actionToast, setActionToast] = useState(null)

  // Right-click customizado — ver buildContextMenuItems más abajo.
  const [contextMenu, setContextMenu] = useState(null) // { x, y, kind: 'project'|'selection'|'folder', project?, folder?, ids? } | null

  // Drop target del crumb raíz (nombre de la empresa) — sólo existe en el
  // DOM cuando hay breadcrumb (i.e. folderId truthy, ver el render).
  const [rootDragOver, setRootDragOver] = useState(false)

  const canManageProjects = canManageProjectLifecycleForRole(currentUser, company?.membershipRole)
  const canCreateProjects = canCreateProjectsForRole(currentUser, company?.membershipRole)
  const isAdminUser = isAdmin(currentUser)
  // Invariante O2.c: WeBrief interna nunca muestra checkbox/kebab/drag/
  // right-click en las CARDS de proyecto — mismo criterio que
  // `showKebab` en CompaniesPage.jsx (`!company.isInternal`).
  const canOrganize = canManageProjects && !company?.isInternal
  // Carpetas usan un gate DISTINTO de `canManageProjects` — hallazgo al
  // cruzar el backend: `canManageProjectLifecycle` (projectAccess.js, usada
  // por archive/trash/move-to-folder) acepta rol de empresa
  // ['admin','manager','editor'], pero `resolveCompanyRole`
  // (folderTree.js, usada por projectFolders.js para el CRUD de carpetas en
  // sí) sólo acepta ['manager','editor'] — un 'admin' de EMPRESA (no
  // platform admin) queda en 'read' ahí. Si gateáramos "Nueva
  // carpeta"/kebab de carpeta con `canManageProjects` como el resto de la
  // página, ese usuario vería el botón y se llevaría un 403 al usarlo.
  // Mismo patrón que LibraryPage: confiar en el `role` que devuelve EL
  // PROPIO endpoint (GET /project-folders → { role }) en vez de asumir que
  // el permiso general de proyectos aplica 1:1 a carpetas.
  const canManageFolders = foldersRole === 'write'

  useEffect(() => {
    if (!companyId) {
      setCompany(null)
      setProjects([])
      setMembers([])
      setLoading(false)
      return undefined
    }

    let active = true
    const cached = readCompanyCache(companyId)

    if (cached?.company) {
      setCompany(cached.company)
      setProjects(cached.projects || [])
      setMembers(cached.members || [])
      setLoading(false)
      setError('')
    } else {
      setCompany(null)
      setProjects([])
      setMembers([])
      setLoading(true)
    }

    async function loadCompany() {
      try {
        const data = await apiFetch(`/api/companies/${companyId}`)
        if (!active) return
        setCompany(data.company)
        setProjects(data.projects)
        setMembers(data.members)
        writeCompanyCache(companyId, data)
        setError('')
      } catch (err) {
        if (!active) return
        setError(err.message || 'No se pudo cargar la empresa')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCompany()

    return () => {
      active = false
    }
  }, [companyId])

  // Carpetas — fetch aparte (endpoint propio), no bloquea el render
  // principal: si falla, degrada a "sin carpetas" (chips ocultos) en vez
  // de tumbar toda la página — la lista plana de proyectos ya funciona
  // igual que antes de esta ola sin ellas.
  useEffect(() => {
    if (!companyId) {
      setFolders([])
      setFoldersRole(null)
      setFoldersLoadState('ready')
      return undefined
    }
    let active = true
    setFoldersLoadState('loading')
    fetchProjectFolders(companyId)
      .then((data) => {
        if (!active) return
        setFolders(data.folders || [])
        setFoldersRole(data.role || null)
        setFoldersLoadState('ready')
      })
      .catch(() => {
        if (!active) return
        setFolders([])
        setFoldersRole(null)
        setFoldersLoadState('error')
      })
    return () => {
      active = false
    }
  }, [companyId])

  // Guard defensivo: si la URL apunta a un folderId que ya no existe
  // (carpeta eliminada en otra pestaña, bookmark viejo, edición manual),
  // vuelve a la raíz en vez de quedar mostrando una carpeta fantasma vacía
  // para siempre. Sólo dispara una vez que las carpetas cargaron con
  // éxito — un error de red no debe desalojar un deep link válido.
  useEffect(() => {
    if (!folderId || foldersLoadState !== 'ready') return
    const exists = folders.some((folder) => folder.id === folderId)
    if (!exists) goToRoot()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderId, folders, foldersLoadState])

  // Cambiar de carpeta invalida selección + context menu — mismo criterio
  // que LibraryPage al cambiar de folderId/projectId/view.
  useEffect(() => {
    setSelectedIds(new Set())
    setContextMenu(null)
  }, [folderId])

  // Búsqueda debounced 200ms — mismo patrón que LibraryPickerModal
  // (debounce 300ms ahí), sólo que acá filtra client-side en vez de pegarle
  // a un endpoint de búsqueda.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // ESC clears multiselect; do not consume ESC when no selection is active
  // or when any modal/menu is open, so those keep their own ESC handling.
  useEffect(() => {
    if (selectedIds.size === 0) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (moveModalIds || newFolderOpen || renameFolderTarget || moveState || deleteFolderTarget || contextMenu) return
      event.stopPropagation()
      clearSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedIds, moveModalIds, newFolderOpen, renameFolderTarget, moveState, deleteFolderTarget, contextMenu])

  // Auto-cierre del toast de acción a los 15s — igual que LibraryPage.
  useEffect(() => {
    if (!actionToast) return undefined
    const timer = window.setTimeout(() => setActionToast(null), 15000)
    return () => window.clearTimeout(timer)
  }, [actionToast?.id])

  function openProject(projectId) {
    navigate(`/project/${projectId}/editor`)
  }

  function openMoveModal(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return
    setMoveModalIds(ids)
  }

  function closeMoveModal() {
    setMoveModalIds(null)
  }

  function handleMoveSuccess({ moved, failed, targetCompany }) {
    const movedIds = new Set(Array.isArray(moveModalIds) ? moveModalIds : [])
    const nextProjects = projects.filter((project) => !movedIds.has(project.id))
    const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company
    setProjects(nextProjects)
    setCompany(nextCompany)
    clearCompaniesCache()
    if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
    if (selectedIds.size > 0) clearSelection()
    // Fire-and-forget: keep the sidebar switcher's projectCount in sync.
    refreshWorkspace()

    const dest = targetCompany?.name ? `Movidos a ${targetCompany.name}` : `${moved} proyecto(s) movidos`
    const failedCount = Array.isArray(failed) ? failed.length : 0
    showFeedback(failedCount > 0 ? `${dest} (${failedCount} no procesado(s))` : dest)
  }

  function showFeedback(message) {
    setFeedbackNotice(message)
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setFeedbackNotice(''), 4000)
    }
  }

  function toggleSelected(projectId) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  function removeFromSelection(ids) {
    setSelectedIds((current) => {
      if (current.size === 0) return current
      const next = new Set(current)
      for (const id of ids) next.delete(id)
      return next
    })
  }

  // ── Archivar / papelera / duplicar — EXISTENTES, sin cambios ───────────
  // (plan O2.c: "no cambies su semántica ni sus modales"; se mantienen con
  // su flujo actual de banner, NO pasan al ActionToast).

  async function handleBulkArchive() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`¿Archivar ${ids.length} proyecto(s)? Podrás restaurarlos desde Archivados.`)) return
    setBulkBusy(true)
    try {
      const result = await apiFetch('/api/projects/bulk/archive', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      const archived = Number(result?.archived || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      const nextProjects = projects.filter((project) => !selectedIds.has(project.id))
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company
      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
      clearSelection()
      refreshWorkspace()
      showFeedback(failed > 0
        ? `${archived} proyecto(s) archivado(s); ${failed} no procesado(s)`
        : `${archived} proyecto(s) archivado(s)`)
    } catch (err) {
      setError(err.message || 'No se pudieron archivar los proyectos')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkTrash() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`¿Enviar ${ids.length} proyecto(s) a papelera?`)) return
    setBulkBusy(true)
    try {
      const result = await apiFetch('/api/projects/bulk/trash', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      const trashed = Number(result?.trashed || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      const nextProjects = projects.filter((project) => !selectedIds.has(project.id))
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company
      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
      clearSelection()
      refreshWorkspace()
      showFeedback(failed > 0
        ? `${trashed} proyecto(s) enviados a papelera; ${failed} no procesado(s)`
        : `${trashed} proyecto(s) enviados a papelera`)
    } catch (err) {
      setError(err.message || 'No se pudieron enviar a papelera')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleProjectDuplicate(projectId) {
    try {
      const data = await apiFetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' })
      const newProject = data.project
      const nextProjects = [...projects, newProject]
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company
      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
      refreshWorkspace()
    } catch (err) {
      setError(err.message || 'No se pudo duplicar el proyecto')
    }
  }

  async function handleProjectArchive(projectId) {
    if (!window.confirm('¿Archivar este proyecto? Podrás restaurarlo desde la papelera operativa más adelante.')) return
    try {
      await apiFetch(`/api/projects/${projectId}/archive`, { method: 'POST' })
      const nextProjects = projects.filter((project) => project.id !== projectId)
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company

      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
      refreshWorkspace()
    } catch (err) {
      setError(err.message || 'No se pudo archivar el proyecto')
    }
  }

  async function handleProjectTrash(projectId) {
    if (!window.confirm('¿Enviar este proyecto a papelera por 30 días?')) return
    try {
      await apiFetch(`/api/projects/${projectId}/trash`, { method: 'POST' })
      const nextProjects = projects.filter((project) => project.id !== projectId)
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company

      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
      refreshWorkspace()
    } catch (err) {
      setError(err.message || 'No se pudo enviar el proyecto a papelera')
    }
  }

  // ── Navegación de carpetas ──────────────────────────────────────────

  function goToFolder(id) {
    setSearchParams(id ? { folderId: id } : {})
  }

  function goToRoot() {
    setSearchParams({})
  }

  // ── Carpetas — crear / renombrar ───────────────────────────────────
  // Ambas actualizan `folders` de forma optimista con la fila que devuelve
  // el backend (evita un GET extra) e invalidan la cache de empresa
  // (aunque no cambien projects/members, "CRUD de carpetas invalida la
  // cache" es la regla explícita del plan — barato y sin efecto visible
  // adverso, sólo refresca `cachedAt`).

  function openNewFolderModal() {
    setNewFolderOpen(true)
  }

  function closeNewFolderModal() {
    setNewFolderOpen(false)
  }

  function handleFolderCreated(folder) {
    if (!folder) return
    setFolders((current) => [...current, folder])
    writeCompanyCache(companyId, { company, projects, members })
  }

  function openRenameFolderModal(folder) {
    setRenameFolderTarget(folder)
  }

  function closeRenameFolderModal() {
    setRenameFolderTarget(null)
  }

  function handleFolderRenamed(updatedFolder) {
    if (!updatedFolder) return
    setFolders((current) => current.map((folder) => (folder.id === updatedFolder.id ? { ...folder, ...updatedFolder } : folder)))
    writeCompanyCache(companyId, { company, projects, members })
  }

  // ── Mover (proyectos en bulk o una carpeta) ────────────────────────

  function openMoveProjectsModal(ids) {
    if (!ids?.length) return
    setMoveState({ kind: 'projects', ids })
  }

  function openMoveFolderModal(folder) {
    if (!folder) return
    setMoveState({ kind: 'folder', folder })
  }

  function closeMoveStateModal() {
    setMoveState(null)
  }

  // Mutación compartida por tres caminos: el modal (kebab/context menu
  // "Mover a carpeta"), el drag & drop nativo (chips/crumb raíz), y el
  // toolbar bulk. Deshacer: snapshotea el folderId PREVIO de cada proyecto
  // ANTES de mutar — `projects` todavía refleja el estado pre-move acá
  // porque la actualización optimista corre después. El undo agrupa los
  // ids movidos por su carpeta origen (una selección puede mezclar
  // proyectos de carpetas distintas) y hace UNA llamada por grupo.
  //
  // Actualización de `projects` SIEMPRE vía forma funcional (`setProjects
  // (current => ...)`), tanto acá como en el undo — el toast de deshacer
  // vive hasta 15s, una ventana real donde OTRA mutación (archivar,
  // duplicar, otro move) puede completar antes de que el usuario haga
  // click en "Deshacer"; capturar `projects` por closure y reconstruir el
  // array desde ese snapshot (como hacía una versión anterior de esta
  // función) pisaría esa mutación intermedia en la UI al deshacer. Con la
  // forma funcional, el callback siempre parte del `current` MÁS
  // RECIENTE — y si un id ya no está (p. ej. se archivó mientras tanto),
  // el `.map` simplemente no lo toca, en vez de resucitarlo. El cache de
  // sessionStorage se escribe DENTRO del propio updater para poder usar
  // ese mismo `next` recién calculado (writeCompanyCache no es parte del
  // ciclo de render de React, así que esto es seguro).
  async function moveProjectsToFolderAndNotify(ids, targetFolderId) {
    const prevFolderById = new Map(
      projects.filter((project) => ids.includes(project.id)).map((project) => [project.id, project.folderId ?? null])
    )

    const result = await moveProjectsToFolder(ids, targetFolderId)
    const moved = Number(result?.moved || 0)
    const failed = Array.isArray(result?.failed) ? result.failed.length : 0
    const failedIds = new Set((result?.failed || []).map((item) => item.id))
    const movedIds = ids.filter((id) => !failedIds.has(id))

    setProjects((current) => {
      const next = current.map((project) => (movedIds.includes(project.id) ? { ...project, folderId: targetFolderId } : project))
      writeCompanyCache(companyId, { company, projects: next, members })
      return next
    })

    showActionToast({
      message: failed > 0
        ? `${moved} ${moved === 1 ? 'proyecto movido' : 'proyectos movidos'} · ${failed} no procesado${failed === 1 ? '' : 's'}`
        : `${moved} ${moved === 1 ? 'proyecto movido' : 'proyectos movidos'}`,
      onUndo: movedIds.length > 0 ? async () => {
        const groups = new Map()
        for (const id of movedIds) {
          const prevFolder = prevFolderById.get(id) ?? null
          const key = prevFolder ?? '__root__'
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key).push(id)
        }
        for (const [key, groupIds] of groups) {
          const restoreFolderId = key === '__root__' ? null : key
          await moveProjectsToFolder(groupIds, restoreFolderId)
        }
        setProjects((current) => {
          const next = current.map((project) => {
            for (const [key, groupIds] of groups) {
              if (groupIds.includes(project.id)) {
                return { ...project, folderId: key === '__root__' ? null : key }
              }
            }
            return project
          })
          writeCompanyCache(companyId, { company, projects: next, members })
          return next
        })
      } : undefined,
    })
    removeFromSelection(ids)
  }

  // Mover una CARPETA (reparentar) NO usa el ActionToast — el plan O2.c
  // acota el toast+deshacer específicamente a "mover a carpeta" (mover
  // PROYECTOS; "snapshot de folderId previos" es vocabulario de proyecto,
  // no de carpeta) y deja Archivar/Papelera con su banner de siempre.
  // Reparentar una carpeta es una operación más estructural/rara que
  // arrastrar un proyecto, así que se queda con el mismo banner que
  // Archivar/Duplicar — feedback claro, sin inventar un segundo canal de
  // "deshacer" que el plan no pidió para este caso.
  async function moveFolderAndNotify(movedFolderId, targetFolderId) {
    const result = await updateProjectFolder(companyId, movedFolderId, { parentFolderId: targetFolderId })
    setFolders((current) => current.map((folder) => (folder.id === movedFolderId ? { ...folder, ...result.folder } : folder)))
    writeCompanyCache(companyId, { company, projects, members })
    showFeedback('Carpeta movida')
  }

  async function handleMoveConfirm(targetFolderId) {
    if (!moveState || !companyId) return
    if (moveState.kind === 'projects') {
      await moveProjectsToFolderAndNotify(moveState.ids, targetFolderId)
    } else if (moveState.kind === 'folder') {
      await moveFolderAndNotify(moveState.folder.id, targetFolderId)
    }
  }

  // ── Drag & drop para mover (chips de carpeta + crumb raíz) ─────────
  // Mismas mutaciones que arriba, pero sin modal que capture el reject —
  // el error va al banner de página (no hay un canal de "warning" propio
  // en ProjectsPage, a diferencia de LibraryPage; reusar `error` es
  // suficiente para este caso borde).

  async function handleDropProjects(ids, targetFolderId) {
    if (!ids?.length || !companyId) return
    try {
      await moveProjectsToFolderAndNotify(ids, targetFolderId)
    } catch (err) {
      setError(err.message || 'No se pudo mover')
    }
  }

  async function handleDropFolder(draggedFolderId, targetFolderId) {
    if (!draggedFolderId || !companyId || draggedFolderId === targetFolderId) return
    try {
      await moveFolderAndNotify(draggedFolderId, targetFolderId)
    } catch (err) {
      setError(err.message || 'No se pudo mover la carpeta')
    }
  }

  function handleRootDragOver(event) {
    // Acepta tanto proyectos (gate real: canOrganize) como carpetas (gate
    // real: canManageFolders — DISTINTO de canManageProjects, ver el
    // comentario junto a su declaración) — cualquiera de los dos alcanza,
    // el tipo real del payload (PROJECT_DRAG_TYPE vs FOLDER_DRAG_TYPE) ya
    // sólo puede existir en el dataTransfer si el origen era draggable
    // (gates correctos en ProjectGrid), así que este guard nunca deja
    // pasar un drag que no debería.
    if (!canOrganize && !canManageFolders) return
    const types = event.dataTransfer.types || []
    if (!types.includes(PROJECT_DRAG_TYPE) && !types.includes(FOLDER_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (!rootDragOver) setRootDragOver(true)
  }

  function handleRootDragLeave(event) {
    if (isInternalDragLeave(event)) return
    setRootDragOver(false)
  }

  function handleRootDrop(event) {
    event.preventDefault()
    setRootDragOver(false)
    const projectsPayload = event.dataTransfer.getData(PROJECT_DRAG_TYPE)
    if (projectsPayload) {
      let ids = []
      try {
        ids = JSON.parse(projectsPayload)
      } catch {
        ids = []
      }
      if (Array.isArray(ids) && ids.length) handleDropProjects(ids, null)
      return
    }
    const draggedFolderId = event.dataTransfer.getData(FOLDER_DRAG_TYPE)
    if (draggedFolderId) handleDropFolder(draggedFolderId, null)
  }

  // ── Carpetas — eliminar (reparentea, nunca toca proyectos) ─────────

  function openDeleteFolderModal(folder) {
    setDeleteFolderTarget(folder)
  }

  function closeDeleteFolderModal() {
    setDeleteFolderTarget(null)
  }

  function handleFolderDeleted({ folder, newParentId, reparentedProjects: reparentedProjectsCount, reparentedFolders: reparentedFoldersCount }) {
    setFolders((current) => current
      .filter((item) => item.id !== folder.id)
      .map((item) => ((item.parent_folder_id || null) === folder.id ? { ...item, parent_folder_id: newParentId } : item)))
    const nextProjects = projects.map((project) => ((project.folderId || null) === folder.id ? { ...project, folderId: newParentId } : project))
    setProjects(nextProjects)
    writeCompanyCache(companyId, { company, projects: nextProjects, members })
    // Si borraste la carpeta que estabas mirando, no te quedes viendo una
    // carpeta fantasma — navega al destino donde se reparentó todo.
    if (folderId === folder.id) goToFolder(newParentId)

    const total = Number(reparentedProjectsCount || 0) + Number(reparentedFoldersCount || 0)
    showFeedback(total > 0
      ? `Carpeta eliminada · ${total} elemento${total === 1 ? '' : 's'} reubicado${total === 1 ? '' : 's'}`
      : 'Carpeta eliminada')
  }

  // ── Orden / filtro de tipo / layout ─────────────────────────────────

  function handleSortSelectChange(value) {
    const separatorIndex = value.lastIndexOf('_')
    if (separatorIndex < 0) return
    setSortField(value.slice(0, separatorIndex))
    setSortDir(value.slice(separatorIndex + 1))
  }

  // Compartido con los headers sorteables de la vista lista.
  function handleSortFieldClick(field) {
    if (field === sortField) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'name' ? 'asc' : 'desc')
    }
  }

  function handleLayoutChange(next) {
    setLayout(next)
    try {
      window.localStorage.setItem(LAYOUT_STORAGE_KEY, next)
    } catch {
      // Swallow QuotaExceededError o denial en modo privado.
    }
  }

  // ── Toast de acción con Deshacer ────────────────────────────────────

  function showActionToast({ message, subMessage, onUndo }) {
    setActionToast({ id: Date.now(), message, subMessage, onUndo })
  }

  function closeActionToast() {
    setActionToast(null)
  }

  async function handleUndoToast() {
    const undo = actionToast?.onUndo
    setActionToast(null)
    if (undo) await undo()
  }

  // ── Right-click customizado ──────────────────────────────────────────
  // `selection` sólo cuando ≥2 seleccionados Y el target del right-click ES
  // parte de esa selección — mismo criterio que LibraryPage.

  function openProjectContextMenu(event, project) {
    event.preventDefault()
    const bulk = selectedIds.size >= 2 && selectedIds.has(project.id)
    const ids = bulk ? Array.from(selectedIds) : [project.id]
    setContextMenu({ x: event.clientX, y: event.clientY, kind: bulk ? 'selection' : 'project', project, ids })
  }

  function openFolderContextMenu(event, folder) {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'folder', folder })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  function buildContextMenuItems(menu) {
    if (!menu) return []
    switch (menu.kind) {
      case 'project': {
        const { project, ids } = menu
        return [
          { type: 'item', icon: ExternalLink, label: 'Abrir', onSelect: () => openProject(project.id) },
          { type: 'item', icon: Copy, label: 'Duplicar', onSelect: () => handleProjectDuplicate(project.id) },
          { type: 'separator' },
          { type: 'item', icon: Move, label: 'Mover a carpeta', onSelect: () => openMoveProjectsModal(ids) },
          { type: 'item', icon: Building2, label: 'Mover de empresa', onSelect: () => openMoveModal(ids) },
          { type: 'item', icon: Archive, label: 'Archivar', onSelect: () => handleProjectArchive(project.id) },
          { type: 'separator' },
          { type: 'item', icon: Trash2, label: 'Enviar a papelera', destructive: true, onSelect: () => handleProjectTrash(project.id) },
        ]
      }
      case 'selection': {
        const { ids } = menu
        return [
          { type: 'header', label: `${ids.length} seleccionados` },
          { type: 'separator' },
          { type: 'item', icon: Move, label: 'Mover a carpeta', onSelect: () => openMoveProjectsModal(ids) },
          { type: 'item', icon: Building2, label: 'Mover de empresa', onSelect: () => openMoveModal(ids) },
          { type: 'item', icon: Archive, label: 'Archivar', onSelect: () => handleBulkArchive() },
          { type: 'item', icon: Trash2, label: 'Enviar a papelera', destructive: true, onSelect: () => handleBulkTrash() },
          { type: 'separator' },
          { type: 'item', icon: XCircle, label: 'Deseleccionar todo', onSelect: () => clearSelection() },
        ]
      }
      case 'folder': {
        const { folder } = menu
        return [
          { type: 'item', icon: FolderOpen, label: 'Abrir', onSelect: () => goToFolder(folder.id) },
          { type: 'separator' },
          { type: 'item', icon: Pencil, label: 'Renombrar', onSelect: () => openRenameFolderModal(folder) },
          { type: 'item', icon: Move, label: 'Mover', onSelect: () => openMoveFolderModal(folder) },
          { type: 'separator' },
          { type: 'item', icon: Trash2, label: 'Eliminar', destructive: true, onSelect: () => openDeleteFolderModal(folder) },
        ]
      }
      default:
        return []
    }
  }

  // Workspace not resolved yet — nothing meaningful to render.
  if (!currentCompany) return null

  // ── Datos derivados — filtrado/orden client-side, plain consts (no
  // useMemo, mismo criterio que LibraryPage.jsx: listas chicas, no vale la
  // pena la contabilidad de dependencias). ──────────────────────────────

  const isRoot = !folderId

  const projectCountByFolder = new Map()
  for (const project of projects) {
    const key = project.folderId || null
    projectCountByFolder.set(key, (projectCountByFolder.get(key) || 0) + 1)
  }

  const childFolders = folders
    .filter((folder) => (folder.parent_folder_id || null) === (folderId || null))
    .map((folder) => ({ ...folder, projectCount: projectCountByFolder.get(folder.id) || 0 }))

  const folderScopedProjects = projects.filter((project) => (project.folderId || null) === (folderId || null))
  const totalInFolderCount = folderScopedProjects.length + childFolders.length

  const searchedProjects = search
    ? folderScopedProjects.filter((project) => `${project.name || ''} ${project.client || ''}`.toLowerCase().includes(search))
    : folderScopedProjects

  // Compara por LABEL (no por valor crudo) para que el filtro nunca
  // diverja del chip que el usuario ve en la card — un projectType que no
  // matchea ninguno de los 4 valores canónicos igual cae en "Contenido
  // Web" vía projectTypeLabel, y así también lo hace el filtro.
  const typeFilteredProjects = typeFilter === 'all'
    ? searchedProjects
    : searchedProjects.filter((project) => projectTypeLabel(project.projectType) === projectTypeLabel(typeFilter))

  const visibleProjects = sortWithDirection(typeFilteredProjects, (a, b) => compareProjectsBy(a, b, sortField), sortDir)

  const breadcrumbChain = (() => {
    if (!folderId) return []
    const byId = new Map(folders.map((folder) => [folder.id, folder]))
    const chain = []
    const seen = new Set()
    let cursor = byId.get(folderId)
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id)
      chain.unshift(cursor)
      cursor = cursor.parent_folder_id ? byId.get(cursor.parent_folder_id) : null
    }
    return chain
  })()

  const sortSelectValue = SORT_SELECT_KEYS.has(`${sortField}_${sortDir}`) ? `${sortField}_${sortDir}` : ''
  const contextMenuItems = buildContextMenuItems(contextMenu)

  return (
    <div className={styles.page}>
      {loading && <p className={styles.info}>Cargando empresa...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}

      {!loading && company && (
        <>
          <header className={styles.pageHeader}>
            <div className={styles.pageHeaderInner}>
              {folderId && breadcrumbChain.length > 0 && (
                <nav className={styles.breadcrumb} aria-label="Carpetas">
                  <span className={styles.breadcrumbGroup}>
                    <button
                      type="button"
                      className={cx(styles.breadcrumbLink, rootDragOver && styles.breadcrumbLinkDragOver)}
                      onClick={goToRoot}
                      onDragOver={handleRootDragOver}
                      onDragLeave={handleRootDragLeave}
                      onDrop={handleRootDrop}
                    >
                      {company.name}
                    </button>
                  </span>
                  {breadcrumbChain.map((folder, index) => {
                    const isCurrent = index === breadcrumbChain.length - 1
                    return (
                      <span key={folder.id} className={styles.breadcrumbGroup}>
                        <ChevronRight size={14} className={styles.breadcrumbSep} aria-hidden="true" />
                        {isCurrent ? (
                          <span className={styles.breadcrumbCurrent} aria-current="page">{folder.name}</span>
                        ) : (
                          <button type="button" className={styles.breadcrumbLink} onClick={() => goToFolder(folder.id)}>
                            {folder.name}
                          </button>
                        )}
                      </span>
                    )
                  })}
                </nav>
              )}

              <div className={styles.titleRow}>
                <div className={styles.headerMain}>
                  <div className={styles.titleLine}>
                    <h1 className={styles.title}>{company.name}</h1>
                    {company.isInternal && <Badge variant="neutral" size="sm">Interna</Badge>}
                  </div>
                  <div className={styles.headerMeta}>
                    <span>{company.projectCount} proyecto{company.projectCount === 1 ? '' : 's'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{company.memberCount} miembro{company.memberCount === 1 ? '' : 's'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{getCompanyRoleLabel(currentUser, company.membershipRole)}</span>
                  </div>
                </div>
                <div className={styles.headerActions}>
                  {canManageFolders && (
                    <Button
                      variant="secondary"
                      icon={<FolderPlus size={16} />}
                      onClick={openNewFolderModal}
                    >
                      Nueva carpeta
                    </Button>
                  )}
                  {canCreateProjects && (
                    <Button
                      variant="primary"
                      icon={<Plus size={16} />}
                      data-tour="create-project-btn"
                      onClick={() => navigate(`/new-project?companyId=${companyId}`)}
                    >
                      Proyecto
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </header>

          <div className={styles.pageBody}>
            <div className={styles.tabPanel}>
              <section className={styles.projectsSection}>
                {feedbackNotice && (
                  <div className={styles.feedbackNotice} role="status">
                    {feedbackNotice}
                  </div>
                )}

                <ProjectsToolbar
                  canOrganize={canOrganize}
                  selectionCount={selectedIds.size}
                  bulkBusy={bulkBusy}
                  searchValue={searchInput}
                  onSearchChange={setSearchInput}
                  sortValue={sortSelectValue}
                  onSortChange={handleSortSelectChange}
                  typeFilter={typeFilter}
                  onTypeFilterChange={setTypeFilter}
                  layout={layout}
                  onLayoutChange={handleLayoutChange}
                  onMoveToFolder={() => openMoveProjectsModal(Array.from(selectedIds))}
                  onMoveCompany={() => openMoveModal(Array.from(selectedIds))}
                  onArchive={handleBulkArchive}
                  onTrash={handleBulkTrash}
                  onCancel={clearSelection}
                />

                <ProjectGrid
                  folders={childFolders}
                  projects={visibleProjects}
                  totalInFolderCount={totalInFolderCount}
                  isRoot={isRoot}
                  layout={layout}
                  sortField={sortField}
                  sortDir={sortDir}
                  onSortFieldClick={handleSortFieldClick}
                  canOrganize={canOrganize}
                  canManageProjects={canManageProjects}
                  canManageFolders={canManageFolders}
                  canCreateProjects={canCreateProjects}
                  selectedIds={selectedIds}
                  onToggleSelect={toggleSelected}
                  onOpenProject={openProject}
                  onDuplicateProject={handleProjectDuplicate}
                  onMoveProjectToFolder={openMoveProjectsModal}
                  onMoveProjectCompany={openMoveModal}
                  onArchiveProject={handleProjectArchive}
                  onTrashProject={handleProjectTrash}
                  onCreateProject={() => navigate(`/new-project?companyId=${companyId}`)}
                  onOpenFolder={goToFolder}
                  onRenameFolder={openRenameFolderModal}
                  onMoveFolder={openMoveFolderModal}
                  onDeleteFolder={openDeleteFolderModal}
                  onDropProjects={handleDropProjects}
                  onDropFolder={handleDropFolder}
                  onProjectContextMenu={openProjectContextMenu}
                  onFolderContextMenu={openFolderContextMenu}
                />
              </section>
            </div>
          </div>
        </>
      )}

      <MoveToCompanyModal
        open={Boolean(moveModalIds && moveModalIds.length > 0)}
        ids={moveModalIds || []}
        currentCompanyId={companyId}
        isAdmin={isAdminUser}
        onClose={closeMoveModal}
        onSuccess={handleMoveSuccess}
      />

      <NewProjectFolderModal
        open={newFolderOpen}
        onClose={closeNewFolderModal}
        companyId={companyId}
        parentFolderId={folderId}
        onCreated={handleFolderCreated}
      />

      <RenameProjectFolderModal
        open={Boolean(renameFolderTarget)}
        onClose={closeRenameFolderModal}
        companyId={companyId}
        folder={renameFolderTarget}
        onRenamed={handleFolderRenamed}
      />

      <MoveProjectsToFolderModal
        open={Boolean(moveState)}
        onClose={closeMoveStateModal}
        folders={folders}
        moveState={moveState}
        onConfirm={handleMoveConfirm}
      />

      <DeleteProjectFolderModal
        open={Boolean(deleteFolderTarget)}
        onClose={closeDeleteFolderModal}
        companyId={companyId}
        folder={deleteFolderTarget}
        allFolders={folders}
        projects={projects}
        onDeleted={handleFolderDeleted}
      />

      <ItemContextMenu
        open={Boolean(contextMenu)}
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        items={contextMenuItems}
        onClose={closeContextMenu}
      />

      <ActionToast toast={actionToast} onUndo={handleUndoToast} onClose={closeActionToast} />
    </div>
  )
}
