import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ChevronRight, Download, Eye, FolderOpen, FolderPlus, FolderUp, Info, Move, Pencil, RefreshCw, RotateCcw, Trash2,
  Upload, X, XCircle,
} from 'lucide-react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { Button } from '../components/ui'
import AssetGrid from '../components/library/AssetGrid'
import Lightbox from '../components/library/Lightbox'
import StorageUsageBar from '../components/library/StorageUsageBar'
import NewFolderModal from '../components/library/NewFolderModal'
import RenameModal from '../components/library/RenameModal'
import MoveToFolderModal from '../components/library/MoveToFolderModal'
import EmptyTrashModal from '../components/library/EmptyTrashModal'
import LibraryExportModal from '../components/library/LibraryExportModal'
import UploadDropzone from '../components/library/UploadDropzone'
import UploadQueuePanel from '../components/library/UploadQueuePanel'
import FolderUploadConfirmModal from '../components/library/FolderUploadConfirmModal'
import LibraryToolbar from '../components/library/LibraryToolbar'
import ItemContextMenu from '../components/organizer/ItemContextMenu'
import AssetInfoModal from '../components/library/AssetInfoModal'
import ActionToast from '../components/organizer/ActionToast'
import { fetchLibrary, moveAssets, trashAssets, restoreAssets, renameAsset, updateFolder, trashFolder } from '../lib/libraryApi'
import { createUploadQueue, enqueueFiles, formatBytes, partitionEntries, readPickedDirectoryFiles } from '../lib/uploadQueue'
import { filterAssetsByType, sortAssets } from '../lib/libraryAssetUtils'
import styles from './LibraryPage.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const LAYOUT_STORAGE_KEY = 'wb:library:layout'

function readStoredLayout() {
  if (typeof window === 'undefined') return 'grid'
  try {
    return window.localStorage.getItem(LAYOUT_STORAGE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

// Los 5 valores que el Select de orden (punto 3) representa directamente.
// Los headers sorteables de la vista lista (punto 6) comparten el MISMO
// estado sortField/sortDir pero además permiten dimensions/format, que el
// Select no expone como opción — cuando sortField/sortDir cae fuera de
// este set, el Select simplemente muestra su placeholder ("Ordenar") en
// vez de fingir que matchea una de sus 5 opciones.
const SORT_SELECT_KEYS = new Set(['name_asc', 'name_desc', 'date_asc', 'date_desc', 'size_desc'])

// Right-click de fondo (F1.2-B, punto 3): qué NO cuenta como "zona vacía".
// Cubre cards de asset (role="button"), chips/filas de carpeta
// (role="button" o <tr>), headers de tabla (<thead>), cualquier botón/
// input/select real, y la toolbar entera (role="toolbar", ver
// organizer/MorphingToolbar.jsx) — ahí el right-click nativo sigue siendo
// útil (copiar texto del buscador, etc.), así que no se intercepta.
const BACKGROUND_MENU_IGNORE_SELECTOR =
  'button, a, input, textarea, select, tr, thead, [role="button"], [role="menu"], [role="toolbar"], [role="dialog"]'

/**
 * Biblioteca de imágenes por empresa. Orquestador: breadcrumb de carpetas
 * (query param `folderId`), filtro de proyecto (`projectId`), vista papelera
 * (`view=trash`), toolbar (Nueva carpeta / Subir imágenes), barra de uso y
 * subida (dropzone + cola + panel flotante de progreso), multiselección +
 * mover + renombrar + papelera + export ZIP con limpieza opcional, y —
 * iteración UX F1 — (1) kebab siempre visible, (2) toast flotante con
 * Deshacer para mover/papelera, (3) barra persistente que muta entre modo
 * "orden + filtro" y modo "selección" sin reflow, (4) right-click
 * customizado (ItemContextMenu, genérico desde O2.a — ver
 * buildContextMenuItems), (5) panel de información por asset, y (6) toggle
 * grilla/lista con headers sorteables.
 */
export default function LibraryPage() {
  const { currentCompany } = useWorkspace()
  const companyId = currentCompany?.id

  const [searchParams, setSearchParams] = useSearchParams()
  const folderId = searchParams.get('folderId')
  const projectId = searchParams.get('projectId')
  const view = searchParams.get('view')
  const isTrash = view === 'trash'

  const [data, setData] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [newFolderOpen, setNewFolderOpen] = useState(false)
  // "Subir carpeta" disparada desde el menú de fondo (F1.2-B, punto 3,
  // bonus) — mismo modal de confirmación que ya usa el drag&drop de una
  // carpeta arrastrada (UploadDropzone.jsx), pero acá el origen es un
  // <input type="file" webkitdirectory> elegido por diálogo nativo en vez
  // de arrastrado. Estado PROPIO (no se toca UploadDropzone) para no tocar
  // ese flujo ya probado — ver handleFolderFilesPicked más abajo.
  const [folderConfirmState, setFolderConfirmState] = useState(null) // { folderName, accepted, excluded } | null

  // Selección múltiple (sólo assets — ver AssetGrid.jsx), toolbar bulk y
  // modales de mover/renombrar/vaciar papelera. Mismo patrón que
  // ProjectsPage (grep `selectedIds` ahí).
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // Banner superior — DESDE esta iteración (punto 2) sólo se usa para
  // errores. Los avisos de éxito de mover/papelera/exportar/restaurar pasan
  // al toast flotante (`actionToast` más abajo); ver showActionToast.
  const [notice, setNotice] = useState(null) // { tone: 'success' | 'warning', message } | null
  const [moveState, setMoveState] = useState(null) // { kind: 'assets', ids } | { kind: 'folder', folder } | null
  const [renameState, setRenameState] = useState(null) // { kind: 'asset' | 'folder', id, name } | null
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false)
  const [exportState, setExportState] = useState(null) // { ids } | null
  const [lightboxIndex, setLightboxIndex] = useState(null) // index into visibleAssets | null
  // Highlights the "Biblioteca" breadcrumb root crumb while an internal
  // asset/folder drag hovers it — same drop contract as AssetGrid's folder
  // chips (see moveAssetsAndNotify/moveFolderAndNotify below).
  const [rootDragOver, setRootDragOver] = useState(false)

  // Orden + filtro de tipo + layout (puntos 3 y 6 de la iteración UX F1) —
  // client-side sobre `data.assets`, estado LOCAL (no URL, instrucción
  // explícita). `layout` persiste en localStorage; sort/filter no.
  const [sortField, setSortField] = useState('date')
  const [sortDir, setSortDir] = useState('desc')
  const [typeFilter, setTypeFilter] = useState('all')
  const [layout, setLayout] = useState(readStoredLayout)

  // Búsqueda por nombre de archivo (F1.2-B, punto 2 — la barra no tenía
  // search antes de este fix). Debounce 200ms + estado LOCAL, mismo patrón
  // que ProjectsPage.jsx (searchInput/search). Filtra `rawAssets` dentro de
  // la carpeta/vista actual; las carpetas nunca se filtran por texto,
  // igual que ProjectsPage nunca filtra childFolders.
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')

  // Toast flotante inferior con Deshacer (punto 2) — ver ActionToast.jsx.
  // Un solo toast a la vez: showActionToast reemplaza el anterior sin
  // acumular (setState de un único slot, no una lista).
  const [actionToast, setActionToast] = useState(null) // { id, message, subMessage?, onUndo? } | null

  // Right-click customizado (punto 4) — ver organizer/ItemContextMenu.jsx
  // + buildContextMenuItems más abajo (traduce este shape a `items`).
  const [contextMenu, setContextMenu] = useState(null) // { x, y, kind, asset?, folder?, index?, ids? } | null

  // Panel de información (punto 5) — ver AssetInfoModal.jsx.
  const [infoAsset, setInfoAsset] = useState(null)

  // Cola de subida: vive en un ref (no en estado) porque es un objeto con
  // métodos + un array mutable interno, no un valor serializable — ver
  // frontend/src/lib/uploadQueue.js. `queueItems` es la copia inmutable
  // que createUploadQueue va empujando vía onUpdate para que React pueda
  // re-renderizar UploadQueuePanel.
  const queueRef = useRef(null)
  const [queueItems, setQueueItems] = useState([])
  const [panelVisible, setPanelVisible] = useState(false)

  const reload = useCallback(async () => {
    if (!companyId) return
    setLoadState('loading')
    try {
      const result = await fetchLibrary(companyId, { folderId, projectId, view })
      setData(result)
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [companyId, folderId, projectId, view])

  useEffect(() => {
    reload()
  }, [reload])

  // (Re)crea la cola cuando la empresa activa queda resuelta (o cambia).
  // Limpia el estado visible de una eventual empresa anterior para no
  // arrastrar filas de subida de otro workspace.
  useEffect(() => {
    if (!companyId) return
    setQueueItems([])
    setPanelVisible(false)
    queueRef.current = createUploadQueue({
      companyId,
      onUpdate: (items) => setQueueItems(items),
    })
  }, [companyId])

  // Cambiar de carpeta/proyecto/vista invalida cualquier selección y
  // context menu previos — evita accionar en bulk sobre ids que ya no
  // están a la vista, o dejar un menú contextual apuntando a un asset que
  // ya no está montado.
  useEffect(() => {
    setSelectedIds(new Set())
    setContextMenu(null)
  }, [folderId, projectId, view])

  // Búsqueda debounced 200ms — mismo patrón que ProjectsPage.jsx.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 200)
    return () => window.clearTimeout(timer)
  }, [searchInput])

  // Los avisos de éxito se ocultan solos; los de advertencia (p. ej.
  // "conservadas por estar referenciadas") persisten hasta que el usuario
  // los cierra — mismo criterio que EditorToast (ver CONTEXT.min.md
  // target=editor.navbar: "warning persiste con acción, info auto-oculta").
  useEffect(() => {
    if (!notice || notice.tone !== 'success') return undefined
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // Auto-cierre del toast de acción a los 15s. Keyed en `actionToast?.id`
  // (no en el objeto completo) para que SÓLO una acción nueva reinicie el
  // timer — cerrar/deshacer ponen actionToast en null, lo que también
  // limpia el timer anterior vía el cleanup de este mismo efecto sin
  // programar uno nuevo (el guard de arriba corta antes del setTimeout).
  useEffect(() => {
    if (!actionToast) return undefined
    const timer = window.setTimeout(() => setActionToast(null), 15000)
    return () => window.clearTimeout(timer)
  }, [actionToast?.id])

  // ESC limpia la selección sin robar el ESC a un modal/menú abierto (cada
  // overlay maneja su propio cierre; acá sólo evitamos que dos actúen a la
  // vez — p. ej. que un ESC cierre el ItemContextMenu Y también borre la
  // selección en el mismo golpe de tecla).
  useEffect(() => {
    if (selectedIds.size === 0) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (moveState || renameState || emptyTrashOpen || exportState || lightboxIndex !== null || contextMenu || infoAsset) return
      event.stopPropagation()
      clearSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedIds, moveState, renameState, emptyTrashOpen, exportState, lightboxIndex, contextMenu, infoAsset])

  function handleFilesPicked(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = '' // permite volver a elegir el mismo archivo más tarde
    const queue = queueRef.current
    if (!files.length || !queue) return
    enqueueFiles(queue, files, folderId)
    setPanelVisible(true)
  }

  // "Subir carpeta" (punto 3, bonus) — mismo árbol de revisión que arrastrar
  // una carpeta (readDroppedItems + FolderUploadConfirmModal), pero desde el
  // diálogo nativo del <input webkitdirectory>. Ver readPickedDirectoryFiles
  // en uploadQueue.js para el porqué del mismo shape {file, relativePath}.
  function handleFolderFilesPicked(event) {
    const fileList = event.target.files
    event.target.value = ''
    if (!fileList?.length) return
    const { files, folderName } = readPickedDirectoryFiles(fileList)
    if (!files.length) return
    const { accepted, excluded } = partitionEntries(files)
    setFolderConfirmState({ folderName, accepted, excluded })
  }

  function handleRetryUpload(id) {
    queueRef.current?.retry(id)
  }

  function handleCloseQueuePanel() {
    queueRef.current?.clearDone()
    setPanelVisible(false)
  }

  function goToFolder(id) {
    setSearchParams(id ? { folderId: id } : {})
  }

  function goToRoot() {
    setSearchParams({})
  }

  function toggleTrashView() {
    setSearchParams(isTrash ? {} : { view: 'trash' })
  }

  function clearProjectFilter() {
    const next = new URLSearchParams(searchParams)
    next.delete('projectId')
    setSearchParams(next)
  }

  function showNotice(tone, message) {
    setNotice({ tone, message })
  }

  function dismissNotice() {
    setNotice(null)
  }

  // ── Toast de acción con Deshacer (punto 2) ─────────────────────────────

  function showActionToast({ message, subMessage, onUndo }) {
    setActionToast({ id: Date.now(), message, subMessage, onUndo })
  }

  function closeActionToast() {
    setActionToast(null)
  }

  async function handleUndoToast() {
    const undo = actionToast?.onUndo
    // Cierra ANTES de ejecutar el undo — evita que un doble click alcance a
    // disparar la acción dos veces mientras el await está en vuelo.
    setActionToast(null)
    if (undo) await undo()
  }

  function toggleSelected(id) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  // Quita sólo los ids indicados de la selección, en vez de vaciarla toda.
  // Importante porque handleMoveConfirm/handleTrashAssets/handleRestoreAssets
  // se llaman tanto desde el toolbar bulk (ids === selectedIds completo)
  // como desde el kebab/context menu de un solo asset (que puede no estar
  // seleccionado, o el usuario puede tener OTROS assets seleccionados
  // aparte) — no queremos que una acción suelta borre una selección bulk
  // no relacionada. Mismo criterio que ProjectsPage.
  function removeFromSelection(ids) {
    setSelectedIds((current) => {
      if (current.size === 0) return current
      const next = new Set(current)
      for (const id of ids) next.delete(id)
      return next
    })
  }

  // ── Mover (assets en bulk o una carpeta) ──────────────────────────────

  function openMoveAssetsModal(ids) {
    if (!ids?.length) return
    setMoveState({ kind: 'assets', ids })
  }

  function openMoveFolderModal(folder) {
    if (!folder) return
    setMoveState({ kind: 'folder', folder })
  }

  function closeMoveModal() {
    setMoveState(null)
  }

  // Mutación compartida por tres caminos: el modal MoveToFolderModal (kebab
  // "Mover"/"Mover a carpeta"), el drag & drop nativo sobre folder chips/
  // filas/el crumb "Biblioteca", y el ItemContextMenu ("Mover"/"Mover a
  // carpeta"). Estas dos funciones NO atrapan errores — MoveToFolderModal.
  // handleConfirm ya envuelve su llamada a onConfirm en try/catch para
  // mostrar el error inline en el modal; el camino de drag & drop (sin
  // modal) hace su propio try/catch más abajo y lo manda al banner.
  //
  // Deshacer (punto 2.a): snapshotea el folder_id PREVIO de cada asset
  // ANTES de mutar — `data.assets` todavía refleja el estado pre-move en
  // este punto porque `reload()` corre después. El undo agrupa los ids
  // movidos por su carpeta origen (un asset por selección puede venir de
  // carpetas distintas si el usuario seleccionó a través de un filtro/
  // búsqueda) y hace UNA llamada a moveAssets por grupo, no una por id.
  async function moveAssetsAndNotify(ids, targetFolderId) {
    const prevFolderById = new Map(
      (data?.assets || [])
        .filter((asset) => ids.includes(asset.id))
        .map((asset) => [asset.id, asset.folder_id ?? null])
    )

    const result = await moveAssets(companyId, ids, targetFolderId)
    const moved = Number(result?.moved || 0)
    const failed = Array.isArray(result?.failed) ? result.failed.length : 0
    const failedIds = new Set((result?.failed || []).map((item) => item.id))
    const movedIds = ids.filter((id) => !failedIds.has(id))

    showActionToast({
      message: failed > 0
        ? `${moved} ${moved === 1 ? 'imagen' : 'imágenes'} movida${moved === 1 ? '' : 's'} · ${failed} no procesada${failed === 1 ? '' : 's'}`
        : `${moved} ${moved === 1 ? 'imagen' : 'imágenes'} movida${moved === 1 ? '' : 's'}`,
      onUndo: movedIds.length > 0 ? async () => {
        const groups = new Map()
        for (const id of movedIds) {
          const prevFolder = prevFolderById.get(id) ?? null
          const key = prevFolder ?? '__root__'
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key).push(id)
        }
        for (const [key, groupIds] of groups) {
          await moveAssets(companyId, groupIds, key === '__root__' ? null : key)
        }
        await reload()
      } : undefined,
    })
    removeFromSelection(ids)
    await reload()
  }

  // Named `movedFolderId` (not `folderId`) to avoid shadowing the outer
  // `folderId` (current URL folder, from searchParams) declared above.
  // Deshacer (punto 2.b): snapshotea el parent_folder_id previo desde
  // `data.allFolders` (árbol completo, no sólo `subfolders` — la carpeta
  // movida puede no ser hija directa de la vista actual).
  async function moveFolderAndNotify(movedFolderId, targetFolderId) {
    const prevParentId = (data?.allFolders || []).find((folder) => folder.id === movedFolderId)?.parent_folder_id ?? null
    await updateFolder(companyId, movedFolderId, { parentFolderId: targetFolderId })
    showActionToast({
      message: 'Carpeta movida',
      onUndo: async () => {
        await updateFolder(companyId, movedFolderId, { parentFolderId: prevParentId })
        await reload()
      },
    })
    await reload()
  }

  async function handleMoveConfirm(targetFolderId) {
    if (!moveState || !companyId) return
    if (moveState.kind === 'assets') {
      await moveAssetsAndNotify(moveState.ids, targetFolderId)
    } else if (moveState.kind === 'folder') {
      await moveFolderAndNotify(moveState.folder.id, targetFolderId)
    }
  }

  // ── Drag & drop para mover (folder chips/filas + crumb "Biblioteca") ──
  // Mismas mutaciones que arriba, pero sin modal que capture el reject —
  // acá el error (p. ej. 400 por ciclo de carpetas) va directo al banner
  // (no al toast: es un fallo, no una acción para ofrecer deshacer).
  async function handleDropAssets(ids, targetFolderId) {
    if (!ids?.length || !companyId) return
    try {
      await moveAssetsAndNotify(ids, targetFolderId)
    } catch (err) {
      showNotice('warning', err.message || 'No se pudo mover')
    }
  }

  // Named `draggedFolderId` (not `folderId`) to avoid shadowing the outer
  // `folderId` (current URL folder, from searchParams) declared above.
  async function handleDropFolder(draggedFolderId, targetFolderId) {
    if (!draggedFolderId || !companyId || draggedFolderId === targetFolderId) return
    try {
      await moveFolderAndNotify(draggedFolderId, targetFolderId)
    } catch (err) {
      showNotice('warning', err.message || 'No se pudo mover la carpeta')
    }
  }

  function handleRootDragOver(event) {
    if (!canWrite) return
    const types = event.dataTransfer.types || []
    if (!types.includes('application/x-webrief-assets') && !types.includes('application/x-webrief-folder')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (!rootDragOver) setRootDragOver(true)
  }

  function handleRootDragLeave(event) {
    const related = event.relatedTarget
    if (related && event.currentTarget.contains(related)) return
    setRootDragOver(false)
  }

  function handleRootDrop(event) {
    event.preventDefault()
    setRootDragOver(false)
    if (!canWrite) return
    const assetsPayload = event.dataTransfer.getData('application/x-webrief-assets')
    if (assetsPayload) {
      let ids = []
      try {
        ids = JSON.parse(assetsPayload)
      } catch {
        ids = []
      }
      if (Array.isArray(ids) && ids.length) handleDropAssets(ids, null)
      return
    }
    const draggedFolderId = event.dataTransfer.getData('application/x-webrief-folder')
    if (draggedFolderId) handleDropFolder(draggedFolderId, null)
  }

  // ── Renombrar (asset o carpeta) ────────────────────────────────────────

  function openRenameAsset(asset) {
    setRenameState({ kind: 'asset', id: asset.id, name: asset.file_name })
  }

  function openRenameFolder(folder) {
    setRenameState({ kind: 'folder', id: folder.id, name: folder.name })
  }

  function closeRenameModal() {
    setRenameState(null)
  }

  async function handleRenameSubmit(newName) {
    if (!renameState || !companyId) return
    if (renameState.kind === 'asset') {
      await renameAsset(companyId, renameState.id, newName)
    } else {
      await updateFolder(companyId, renameState.id, { name: newName })
    }
    await reload()
  }

  // ── Papelera ────────────────────────────────────────────────────────
  // Deshacer (punto 2.c): usa `trashedIds` — los ids EFECTIVAMENTE
  // trasheados que devuelve el backend (backend/src/routes/library.js,
  // POST /assets/bulk/trash), no `ids` del request — algunos pueden haber
  // quedado en `kept` por estar referenciados en un documento y esos NUNCA
  // se tocaron, así que no hay nada que deshacer sobre ellos.

  async function handleTrashAssets(ids) {
    if (!ids?.length) return
    const label = `${ids.length} ${ids.length === 1 ? 'imagen' : 'imágenes'}`
    if (!window.confirm(`¿Enviar ${label} a la papelera?`)) return
    setBulkBusy(true)
    try {
      const result = await trashAssets(companyId, ids)
      const trashed = Number(result?.trashed || 0)
      const trashedIds = Array.isArray(result?.trashedIds) ? result.trashedIds : []
      const kept = Array.isArray(result?.kept) ? result.kept : []
      const subMessage = kept.length > 0
        ? `${kept.length} conservada${kept.length === 1 ? '' : 's'} (usadas en documentos): ${kept.map((item) => item.fileName || 'archivo').join(', ')}`
        : undefined
      showActionToast({
        message: `${trashed} ${trashed === 1 ? 'imagen' : 'imágenes'} enviada${trashed === 1 ? '' : 's'} a papelera`,
        subMessage,
        onUndo: trashedIds.length > 0 ? async () => {
          await restoreAssets(companyId, trashedIds)
          await reload()
        } : undefined,
      })
      removeFromSelection(ids)
      await reload()
    } catch (err) {
      showNotice('warning', err.message || 'No se pudo enviar a la papelera')
    } finally {
      setBulkBusy(false)
    }
  }

  // Generalizado a `ids` explícitos (no sólo `selectedIds`) para que tanto
  // el toolbar bulk (ids === selección completa) como el kebab/context menu
  // de un solo asset trasheado (ids === [asset.id], puede no estar
  // seleccionado) compartan un único chokepoint — mismo criterio que
  // handleTrashAssets/moveAssetsAndNotify.
  async function handleRestoreAssets(ids) {
    if (!ids?.length) return
    setBulkBusy(true)
    try {
      const result = await restoreAssets(companyId, ids)
      const restored = Number(result?.restored || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      showActionToast({
        message: failed > 0
          ? `${restored} restaurada${restored === 1 ? '' : 's'} · ${failed} no encontrada${failed === 1 ? '' : 's'} en la papelera`
          : `${restored} ${restored === 1 ? 'imagen' : 'imágenes'} restaurada${restored === 1 ? '' : 's'}`,
      })
      removeFromSelection(ids)
      await reload()
    } catch (err) {
      showNotice('warning', err.message || 'No se pudo restaurar')
    } finally {
      setBulkBusy(false)
    }
  }

  // Enviar una carpeta a papelera NO ofrece deshacer — el punto 2 del plan
  // sólo pide undo para (a) mover assets, (b) mover carpeta y (c) papelera
  // de assets; el trash de carpeta pasa al mismo toast por consistencia
  // (el banner ya no se usa para esto) pero sin `onUndo` — ActionToast
  // omite el botón "Deshacer" cuando no lo recibe.
  async function handleTrashFolder(folder) {
    if (!window.confirm(`¿Enviar la carpeta "${folder.name}" a la papelera? También se enviará todo su contenido.`)) return
    try {
      const result = await trashFolder(companyId, folder.id)
      const assetsTrashed = Number(result?.assetsTrashed || 0)
      showActionToast({
        message: assetsTrashed > 0
          ? `Carpeta enviada a papelera junto con ${assetsTrashed} ${assetsTrashed === 1 ? 'imagen' : 'imágenes'}`
          : 'Carpeta enviada a papelera',
      })
      await reload()
    } catch (err) {
      showNotice('warning', err.message || 'No se pudo enviar la carpeta a la papelera')
    }
  }

  function handleEmptied({ purged = 0, freedBytes = 0, foldersDeleted = 0 } = {}) {
    const parts = [`${purged} archivo${purged === 1 ? '' : 's'} eliminado${purged === 1 ? '' : 's'}`]
    if (foldersDeleted > 0) parts.push(`${foldersDeleted} carpeta${foldersDeleted === 1 ? '' : 's'} eliminada${foldersDeleted === 1 ? '' : 's'}`)
    showActionToast({ message: `Papelera vaciada · ${parts.join(' · ')} (${formatBytes(freedBytes)} liberados)` })
    reload()
  }

  // ── Exportar ────────────────────────────────────────────────────────
  // LibraryExportModal hace la descarga (fetch→blob) y, si el toggle
  // "Enviar a papelera tras exportar" está activo, encadena trashAssets —
  // acá sólo formateamos el toast final a partir del resultado crudo que
  // devuelve, mismo criterio que handleMoveConfirm/handleEmptied. El undo
  // (cuando hubo auto-trash) reusa el mismo `trashedIds` de la respuesta
  // de trashAssets (punto 2.c), gratis una vez que el backend lo expone.

  function openExportModal(ids) {
    if (!ids?.length) return
    setExportState({ ids })
  }

  function closeExportModal() {
    setExportState(null)
  }

  async function handleExported(trashResult) {
    const exportedIds = exportState?.ids || []
    if (!trashResult) {
      showActionToast({ message: 'Exportación descargada' })
    } else if (trashResult.trashError) {
      // Fallo real (el export sí bajó, pero el trash posterior no) — se
      // queda en el banner, no hay nada que deshacer.
      showNotice('warning', `Se exportó, pero no se pudo enviar a la papelera: ${trashResult.trashError}`)
    } else {
      const trashed = Number(trashResult.trashed || 0)
      const trashedIds = Array.isArray(trashResult.trashedIds) ? trashResult.trashedIds : []
      const kept = Array.isArray(trashResult.kept) ? trashResult.kept : []
      const subMessage = kept.length > 0
        ? `${kept.length} conservada${kept.length === 1 ? '' : 's'} (usadas en documentos): ${kept.map((item) => item.fileName || 'archivo').join(', ')}`
        : undefined
      showActionToast({
        message: `Exportación descargada · ${trashed} enviada${trashed === 1 ? '' : 's'} a papelera`,
        subMessage,
        onUndo: trashedIds.length > 0 ? async () => {
          await restoreAssets(companyId, trashedIds)
          await reload()
        } : undefined,
      })
    }
    removeFromSelection(exportedIds)
    await reload()
  }

  // ── Orden / filtro de tipo / layout (puntos 3 y 6) ─────────────────────

  function handleSortSelectChange(value) {
    const separatorIndex = value.lastIndexOf('_')
    if (separatorIndex < 0) return
    setSortField(value.slice(0, separatorIndex))
    setSortDir(value.slice(separatorIndex + 1))
  }

  // Compartido con los headers sorteables de la vista lista — clic sobre el
  // campo activo alterna asc/desc; clic sobre uno nuevo lo activa con la
  // dirección "natural" para ese campo (nombre arranca A-Z, el resto
  // arranca con lo más grande/reciente primero).
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
      // Swallow QuotaExceededError o denial en modo privado — mismo guard
      // que LibraryExportModal.writeTrashAfterExportPref.
    }
  }

  // ── Right-click customizado (punto 4) ─────────────────────────────────
  // `bulk` sólo cuando ≥2 seleccionadas Y el target del right-click ES
  // parte de esa selección — right-click sobre una imagen NO seleccionada
  // (aunque haya selección activa en otras) siempre abre el menú de ESA
  // imagen sola, como Drive. La selección en sí NUNCA se muta acá — el
  // menú sólo decide qué ítems mostrar, no cambia `selectedIds`.

  function openAssetContextMenu(event, asset, index) {
    event.preventDefault()
    const bulk = selectedIds.size >= 2 && selectedIds.has(asset.id)
    const ids = bulk ? Array.from(selectedIds) : [asset.id]
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      kind: isTrash ? (bulk ? 'trash-selection' : 'trash-asset') : (bulk ? 'selection' : 'asset'),
      asset,
      index,
      ids,
    })
  }

  function openFolderContextMenu(event, folder) {
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, kind: 'folder', folder })
  }

  // Right-click en zona vacía (punto 3) — se cuelga del contenedor del
  // CONTENIDO (`.pageBody`, ver el JSX más abajo), no de toda la página, así
  // que el header (título/breadcrumb) queda afuera a propósito. "Zona
  // vacía" = target que NO matchea BACKGROUND_MENU_IGNORE_SELECTOR — cards/
  // chips/filas ya tienen su propio onContextMenu más específico (arriba),
  // así que este handler sólo necesita EXCLUIRLOS via closest() para no
  // pisarlos cuando el evento burbujea (algunos de esos handlers no llaman
  // stopPropagation, así que sin este guard el menú de fondo se abriría
  // DEMÁS de el de la card).
  function openPageContextMenu(event) {
    if (event.target.closest(BACKGROUND_MENU_IGNORE_SELECTOR)) return
    event.preventDefault()
    setContextMenu({ x: event.clientX, y: event.clientY, kind: isTrash ? 'page-trash' : 'page' })
  }

  function closeContextMenu() {
    setContextMenu(null)
  }

  // Arma la lista de `items` para ItemContextMenu (`components/organizer/`,
  // O2.a) a partir del `contextMenu` armado arriba. Este mapeo ES el
  // conocimiento de dominio que antes vivía DENTRO de
  // LibraryContextMenu.renderItems() — el componente genérico sólo sabe
  // pintar `{ type, icon, label, onSelect, destructive, disabled }`.
  // Mismos labels/orden/íconos que antes, sólo cambió DÓNDE vive la
  // decisión de qué mostrar.
  function buildContextMenuItems(menu) {
    if (!menu) return []
    switch (menu.kind) {
      case 'asset': {
        const { asset, index, ids } = menu
        return [
          { type: 'item', icon: Eye, label: 'Vista previa', onSelect: () => setLightboxIndex(index) },
          { type: 'item', icon: Info, label: 'Información', onSelect: () => setInfoAsset(asset) },
          { type: 'separator' },
          { type: 'item', icon: Pencil, label: 'Renombrar', onSelect: () => openRenameAsset(asset) },
          { type: 'item', icon: Move, label: 'Mover a carpeta', onSelect: () => openMoveAssetsModal(ids) },
          { type: 'item', icon: Download, label: 'Exportar', onSelect: () => openExportModal(ids) },
          { type: 'separator' },
          { type: 'item', icon: Trash2, label: 'Enviar a papelera', destructive: true, onSelect: () => handleTrashAssets(ids) },
        ]
      }
      case 'selection': {
        const { ids } = menu
        return [
          { type: 'header', label: `${ids.length} seleccionadas` },
          { type: 'separator' },
          { type: 'item', icon: Move, label: 'Mover', onSelect: () => openMoveAssetsModal(ids) },
          { type: 'item', icon: Download, label: 'Exportar', onSelect: () => openExportModal(ids) },
          { type: 'item', icon: Trash2, label: 'Enviar a papelera', destructive: true, onSelect: () => handleTrashAssets(ids) },
          { type: 'separator' },
          { type: 'item', icon: XCircle, label: 'Deseleccionar todo', onSelect: () => clearSelection() },
        ]
      }
      case 'folder': {
        const { folder } = menu
        return [
          { type: 'item', icon: FolderOpen, label: 'Abrir', onSelect: () => goToFolder(folder.id) },
          { type: 'separator' },
          { type: 'item', icon: Pencil, label: 'Renombrar', onSelect: () => openRenameFolder(folder) },
          { type: 'item', icon: Move, label: 'Mover', onSelect: () => openMoveFolderModal(folder) },
          { type: 'separator' },
          { type: 'item', icon: Trash2, label: 'Enviar a papelera', destructive: true, onSelect: () => handleTrashFolder(folder) },
        ]
      }
      case 'trash-asset': {
        const { ids } = menu
        return [{ type: 'item', icon: RotateCcw, label: 'Restaurar', onSelect: () => handleRestoreAssets(ids) }]
      }
      case 'trash-selection': {
        const { ids } = menu
        return [{ type: 'item', icon: RotateCcw, label: `Restaurar ${ids.length}`, onSelect: () => handleRestoreAssets(ids) }]
      }
      // Right-click en zona vacía (punto 3) — items de PÁGINA, no de un
      // asset/carpeta puntual. "Nueva carpeta"/"Subir imágenes"/"Subir
      // carpeta" sólo si canWrite (mismo gate que los botones del header,
      // showToolbarActions); "Actualizar" siempre visible, reusa el mismo
      // `reload()` que el botón "Reintentar" de AssetGrid en estado error.
      case 'page': {
        const items = []
        if (canWrite) {
          items.push(
            { type: 'item', icon: FolderPlus, label: 'Nueva carpeta', onSelect: () => setNewFolderOpen(true) },
            { type: 'item', icon: Upload, label: 'Subir imágenes', onSelect: () => document.getElementById('library-file-input')?.click() },
            { type: 'item', icon: FolderUp, label: 'Subir carpeta', onSelect: () => document.getElementById('library-folder-input')?.click() },
            { type: 'separator' }
          )
        }
        items.push({ type: 'item', icon: RefreshCw, label: 'Actualizar', onSelect: () => reload() })
        return items
      }
      case 'page-trash': {
        const items = [{ type: 'item', icon: RefreshCw, label: 'Actualizar', onSelect: () => reload() }]
        if (canWrite && assetCount > 0) {
          items.push({ type: 'separator' }, { type: 'item', icon: Trash2, label: 'Vaciar papelera', destructive: true, onSelect: () => setEmptyTrashOpen(true) })
        }
        return items
      }
      default:
        return []
    }
  }

  // Workspace not resolved yet — nothing meaningful to render (matches
  // ProjectsPage's guard for the same currentCompany-not-ready window).
  if (!currentCompany) return null

  const canWrite = data?.role === 'write'
  // Creating a folder or uploading doesn't map to anything meaningful while
  // looking at the trash (flat list, no folder scoping there) — hide the
  // toolbar rather than let it silently act on a stale folderId.
  const showToolbarActions = canWrite && !isTrash
  const breadcrumbChain = !isTrash ? data?.breadcrumb || [] : []
  const currentFolder = breadcrumbChain.length ? breadcrumbChain[breadcrumbChain.length - 1] : null
  const pageTitle = isTrash ? 'Papelera' : currentFolder?.name || 'Biblioteca'
  const rawAssets = data?.assets || []
  const assetCount = rawAssets.length
  const folderCount = data?.subfolders?.length ?? 0
  const metaText = isTrash
    ? `${assetCount} ${assetCount === 1 ? 'imagen' : 'imágenes'} en papelera`
    : `${assetCount} ${assetCount === 1 ? 'imagen' : 'imágenes'} · ${folderCount} carpeta${folderCount === 1 ? '' : 's'}`
  const selectionCount = selectedIds.size

  // Búsqueda + orden + filtro de tipo client-side (puntos 2 y 3) — la
  // búsqueda SÍ aplica en papelera (útil para encontrar un archivo
  // trasheado por nombre); el filtro de tipo no (la toolbar tampoco lo
  // muestra ahí, ver LibraryToolbar). El Lightbox navega sobre esta MISMA
  // lista (ver más abajo) para que prev/next siga el orden visual que el
  // usuario ve.
  const searchedAssets = search
    ? rawAssets.filter((asset) => (asset.file_name || '').toLowerCase().includes(search))
    : rawAssets
  const typeFilteredAssets = isTrash ? searchedAssets : filterAssetsByType(searchedAssets, typeFilter)
  const visibleAssets = sortAssets(typeFilteredAssets, sortField, sortDir)
  const sortSelectValue = SORT_SELECT_KEYS.has(`${sortField}_${sortDir}`) ? `${sortField}_${sortDir}` : ''
  const contextMenuItems = buildContextMenuItems(contextMenu)

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <div className={styles.titleRow}>
            <div className={styles.headerMain}>
              <nav className={styles.breadcrumb} aria-label="Carpetas">
                <button
                  type="button"
                  className={cx(styles.breadcrumbLink, rootDragOver && styles.breadcrumbLinkDragOver)}
                  onClick={goToRoot}
                  onDragOver={handleRootDragOver}
                  onDragLeave={handleRootDragLeave}
                  onDrop={handleRootDrop}
                >
                  Biblioteca
                </button>
                {isTrash && (
                  <span className={styles.breadcrumbGroup}>
                    <ChevronRight size={14} className={styles.breadcrumbSep} aria-hidden="true" />
                    <span className={styles.breadcrumbCurrent} aria-current="page">Papelera</span>
                  </span>
                )}
                {!isTrash && breadcrumbChain.map((folder, index) => {
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

              <h1 className={styles.title}>{pageTitle}</h1>

              {data && <p className={styles.headerMeta}>{metaText}</p>}

              {projectId && !isTrash && (
                <span className={styles.filterChip}>
                  Filtrando por proyecto
                  <button
                    type="button"
                    className={styles.filterChipClose}
                    onClick={clearProjectFilter}
                    aria-label="Quitar filtro de proyecto"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              )}
            </div>

            {showToolbarActions && (
              <div className={styles.headerActions}>
                <Button
                  type="button"
                  variant="secondary"
                  icon={<FolderPlus size={16} />}
                  onClick={() => setNewFolderOpen(true)}
                >
                  Nueva carpeta
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  icon={<Upload size={16} />}
                  onClick={() => document.getElementById('library-file-input')?.click()}
                >
                  Subir imágenes
                </Button>
                <input
                  type="file"
                  id="library-file-input"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.gif,.svg"
                  hidden
                  onChange={handleFilesPicked}
                />
                {/* "Subir carpeta" (punto 3, bonus) — sin botón visible propio
                    a propósito (elegido lo más simple: sólo vive en el menú
                    de right-click de fondo, ver buildContextMenuItems 'page');
                    este input es el target que ese item dispara por id, mismo
                    patrón que library-file-input de arriba.
                    webkitdirectory/directory no son props React reconocidas,
                    pero React 16+ pasa atributos desconocidos tal cual al DOM
                    — el browser los interpreta igual que en HTML plano. */}
                <input
                  type="file"
                  id="library-folder-input"
                  webkitdirectory=""
                  directory=""
                  multiple
                  hidden
                  onChange={handleFolderFilesPicked}
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <UploadDropzone
        companyId={companyId}
        folderId={folderId}
        folderLabel={pageTitle}
        queueRef={queueRef}
        disabled={!showToolbarActions}
        onQueued={() => setPanelVisible(true)}
      >
        <div className={styles.pageBody} onContextMenu={openPageContextMenu}>
          {notice && (
            <div className={cx(styles.notice, notice.tone === 'warning' && styles.noticeWarning)} role="status">
              <span>{notice.message}</span>
              {notice.tone === 'warning' && (
                <button type="button" className={styles.noticeClose} onClick={dismissNotice} aria-label="Cerrar aviso">
                  <X size={14} />
                </button>
              )}
            </div>
          )}

          <LibraryToolbar
            isTrash={isTrash}
            canWrite={canWrite}
            selectionCount={selectionCount}
            bulkBusy={bulkBusy}
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            sortValue={sortSelectValue}
            onSortChange={handleSortSelectChange}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            layout={layout}
            onLayoutChange={handleLayoutChange}
            onMove={() => openMoveAssetsModal(Array.from(selectedIds))}
            onExport={() => openExportModal(Array.from(selectedIds))}
            onTrash={() => handleTrashAssets(Array.from(selectedIds))}
            onRestore={() => handleRestoreAssets(Array.from(selectedIds))}
            onCancel={clearSelection}
            onEmptyTrash={() => setEmptyTrashOpen(true)}
            emptyTrashDisabled={assetCount === 0}
          />

          <AssetGrid
            folders={data?.subfolders || []}
            assets={visibleAssets}
            totalAssetCount={assetCount}
            loading={loadState === 'loading'}
            error={loadState === 'error'}
            onRetry={reload}
            onOpenFolder={goToFolder}
            canWrite={canWrite}
            view={view}
            layout={layout}
            sortField={sortField}
            sortDir={sortDir}
            onSortFieldClick={handleSortFieldClick}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelected}
            onOpenLightbox={setLightboxIndex}
            onRenameAsset={openRenameAsset}
            onMoveAsset={(asset) => openMoveAssetsModal([asset.id])}
            onExportAsset={(asset) => openExportModal([asset.id])}
            onTrashAsset={(asset) => handleTrashAssets([asset.id])}
            onInfoAsset={setInfoAsset}
            onRenameFolder={openRenameFolder}
            onMoveFolder={openMoveFolderModal}
            onTrashFolder={handleTrashFolder}
            onDropAssets={handleDropAssets}
            onDropFolder={handleDropFolder}
            onAssetContextMenu={openAssetContextMenu}
            onFolderContextMenu={openFolderContextMenu}
          />

          <footer className={styles.footer}>
            <StorageUsageBar
              usage={data?.usage}
              onGoLibrary={isTrash ? toggleTrashView : goToRoot}
              onGoTrash={isTrash ? undefined : toggleTrashView}
              onEmptyTrash={() => setEmptyTrashOpen(true)}
            />
            <button type="button" className={styles.trashToggle} onClick={toggleTrashView}>
              <Trash2 size={14} aria-hidden="true" />
              {isTrash ? 'Volver a la biblioteca' : 'Papelera'}
            </button>
          </footer>
        </div>
      </UploadDropzone>

      {lightboxIndex !== null && (
        <Lightbox
          assets={visibleAssets}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
        />
      )}

      <NewFolderModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        companyId={companyId}
        parentFolderId={folderId}
        onCreated={reload}
      />

      <RenameModal
        open={Boolean(renameState)}
        onClose={closeRenameModal}
        title={renameState?.kind === 'folder' ? 'Renombrar carpeta' : 'Renombrar imagen'}
        label={renameState?.kind === 'folder' ? 'Nombre de la carpeta' : 'Nombre del archivo'}
        initialValue={renameState?.name || ''}
        maxLength={renameState?.kind === 'folder' ? 80 : 255}
        onSubmit={handleRenameSubmit}
      />

      <MoveToFolderModal
        open={Boolean(moveState)}
        onClose={closeMoveModal}
        folders={data?.allFolders || []}
        moveState={moveState}
        onConfirm={handleMoveConfirm}
      />

      <EmptyTrashModal
        open={emptyTrashOpen}
        onClose={() => setEmptyTrashOpen(false)}
        companyId={companyId}
        assetCount={assetCount}
        trashedBytes={data?.usage?.trashedBytes || 0}
        onEmptied={handleEmptied}
      />

      <LibraryExportModal
        open={Boolean(exportState)}
        onClose={closeExportModal}
        companyId={companyId}
        ids={exportState?.ids || []}
        onExported={handleExported}
      />

      <AssetInfoModal
        open={Boolean(infoAsset)}
        onClose={() => setInfoAsset(null)}
        asset={infoAsset}
        folders={data?.allFolders || []}
      />

      {/* Instancia PROPIA (no la de UploadDropzone, que sólo abre por
          drag&drop) para el flujo "Subir carpeta" disparado desde el menú de
          fondo — ver handleFolderFilesPicked. Mismo patrón que el resto de
          los modales de esta página: siempre montado, gateado por su propio
          `open`. */}
      <FolderUploadConfirmModal
        open={Boolean(folderConfirmState)}
        companyId={companyId}
        parentFolderId={folderId}
        queueRef={queueRef}
        folderName={folderConfirmState?.folderName}
        accepted={folderConfirmState?.accepted || []}
        excluded={folderConfirmState?.excluded || []}
        onClose={() => setFolderConfirmState(null)}
        onConfirmed={() => {
          setFolderConfirmState(null)
          setPanelVisible(true)
        }}
      />

      <ItemContextMenu
        open={Boolean(contextMenu)}
        position={contextMenu ? { x: contextMenu.x, y: contextMenu.y } : null}
        items={contextMenuItems}
        onClose={closeContextMenu}
      />

      {panelVisible && queueItems.length > 0 && (
        <UploadQueuePanel
          items={queueItems}
          onRetry={handleRetryUpload}
          onClose={handleCloseQueuePanel}
          onAllDone={reload}
        />
      )}

      <ActionToast toast={actionToast} onUndo={handleUndoToast} onClose={closeActionToast} />
    </div>
  )
}
