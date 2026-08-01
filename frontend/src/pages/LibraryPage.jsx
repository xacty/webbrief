import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, Download, FolderPlus, Move, RotateCcw, Trash2, Upload, X } from 'lucide-react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { Button } from '../components/ui'
import AssetGrid from '../components/library/AssetGrid'
import StorageUsageBar from '../components/library/StorageUsageBar'
import NewFolderModal from '../components/library/NewFolderModal'
import RenameModal from '../components/library/RenameModal'
import MoveToFolderModal from '../components/library/MoveToFolderModal'
import EmptyTrashModal from '../components/library/EmptyTrashModal'
import LibraryExportModal from '../components/library/LibraryExportModal'
import UploadDropzone from '../components/library/UploadDropzone'
import UploadQueuePanel from '../components/library/UploadQueuePanel'
import { fetchLibrary, moveAssets, trashAssets, restoreAssets, renameAsset, updateFolder, trashFolder } from '../lib/libraryApi'
import { createUploadQueue, enqueueFiles, formatBytes } from '../lib/uploadQueue'
import styles from './LibraryPage.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

/**
 * Biblioteca de imágenes por empresa. Orquestador: breadcrumb de carpetas
 * (query param `folderId`), filtro de proyecto (`projectId`), vista papelera
 * (`view=trash`), toolbar (Nueva carpeta / Subir imágenes), barra de uso y
 * subida (dropzone + cola + panel flotante de progreso, Task 12),
 * multiselección + mover + renombrar + papelera (Task 13), export ZIP con
 * limpieza opcional (Task 14 — ver LibraryExportModal).
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

  // Selección múltiple (sólo assets — ver AssetGrid.jsx), toolbar bulk y
  // modales de mover/renombrar/vaciar papelera. Mismo patrón que
  // ProjectsPage (grep `selectedIds` ahí).
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [notice, setNotice] = useState(null) // { tone: 'success' | 'warning', message } | null
  const [moveState, setMoveState] = useState(null) // { kind: 'assets', ids } | { kind: 'folder', folder } | null
  const [renameState, setRenameState] = useState(null) // { kind: 'asset' | 'folder', id, name } | null
  const [emptyTrashOpen, setEmptyTrashOpen] = useState(false)
  const [exportState, setExportState] = useState(null) // { ids } | null

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

  // Cambiar de carpeta/proyecto/vista invalida cualquier selección previa —
  // evita accionar en bulk sobre ids que ya no están a la vista.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [folderId, projectId, view])

  // Los avisos de éxito se ocultan solos; los de advertencia (p. ej.
  // "conservadas por estar referenciadas") persisten hasta que el usuario
  // los cierra — mismo criterio que EditorToast (ver CONTEXT.min.md
  // target=editor.navbar: "warning persiste con acción, info auto-oculta").
  useEffect(() => {
    if (!notice || notice.tone !== 'success') return undefined
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  // ESC limpia la selección sin robar el ESC a un modal abierto (el propio
  // Modal ya maneja su cierre; acá sólo evitamos que ambos actúen a la vez).
  useEffect(() => {
    if (selectedIds.size === 0) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      if (moveState || renameState || emptyTrashOpen || exportState) return
      event.stopPropagation()
      clearSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedIds, moveState, renameState, emptyTrashOpen, exportState])

  function handleFilesPicked(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = '' // permite volver a elegir el mismo archivo más tarde
    const queue = queueRef.current
    if (!files.length || !queue) return
    enqueueFiles(queue, files, folderId)
    setPanelVisible(true)
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
  // Importante porque handleMoveConfirm/handleTrashAssets se llaman tanto
  // desde el toolbar bulk (ids === selectedIds completo) como desde el
  // kebab de un solo asset (que puede no estar seleccionado, o el usuario
  // puede tener OTROS assets seleccionados aparte) — no queremos que una
  // acción de kebab sobre un asset suelto borre una selección bulk
  // no relacionada. Mismo criterio que ProjectsPage: sus acciones de kebab
  // por-proyecto nunca llaman clearSelection().
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

  async function handleMoveConfirm(targetFolderId) {
    if (!moveState || !companyId) return
    if (moveState.kind === 'assets') {
      const result = await moveAssets(companyId, moveState.ids, targetFolderId)
      const moved = Number(result?.moved || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      showNotice('success', failed > 0
        ? `${moved} imagen${moved === 1 ? '' : 'es'} movida${moved === 1 ? '' : 's'} · ${failed} no procesada${failed === 1 ? '' : 's'}`
        : `${moved} imagen${moved === 1 ? '' : 'es'} movida${moved === 1 ? '' : 's'}`)
      removeFromSelection(moveState.ids)
    } else if (moveState.kind === 'folder') {
      await updateFolder(companyId, moveState.folder.id, { parentFolderId: targetFolderId })
      showNotice('success', 'Carpeta movida')
    }
    await reload()
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

  async function handleTrashAssets(ids) {
    if (!ids?.length) return
    const label = `${ids.length} imagen${ids.length === 1 ? '' : 'es'}`
    if (!window.confirm(`¿Enviar ${label} a la papelera?`)) return
    setBulkBusy(true)
    try {
      const result = await trashAssets(companyId, ids)
      const trashed = Number(result?.trashed || 0)
      const kept = Array.isArray(result?.kept) ? result.kept : []
      if (kept.length > 0) {
        const names = kept.map((item) => item.fileName || 'archivo').join(', ')
        showNotice(
          'warning',
          `${trashed} enviada${trashed === 1 ? '' : 's'} a papelera · ${kept.length} conservada${kept.length === 1 ? '' : 's'} (usadas en documentos): ${names}`
        )
      } else {
        showNotice('success', `${trashed} imagen${trashed === 1 ? '' : 'es'} enviada${trashed === 1 ? '' : 's'} a papelera`)
      }
      removeFromSelection(ids)
      await reload()
    } catch (err) {
      showNotice('warning', err.message || 'No se pudo enviar a la papelera')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleRestoreSelected() {
    const ids = Array.from(selectedIds)
    if (!ids.length) return
    setBulkBusy(true)
    try {
      const result = await restoreAssets(companyId, ids)
      const restored = Number(result?.restored || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      showNotice('success', failed > 0
        ? `${restored} restaurada${restored === 1 ? '' : 's'} · ${failed} no encontrada${failed === 1 ? '' : 's'} en la papelera`
        : `${restored} imagen${restored === 1 ? '' : 'es'} restaurada${restored === 1 ? '' : 's'}`)
      clearSelection()
      await reload()
    } catch (err) {
      showNotice('warning', err.message || 'No se pudo restaurar')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleTrashFolder(folder) {
    if (!window.confirm(`¿Enviar la carpeta "${folder.name}" a la papelera? También se enviará todo su contenido.`)) return
    try {
      const result = await trashFolder(companyId, folder.id)
      const assetsTrashed = Number(result?.assetsTrashed || 0)
      showNotice('success', assetsTrashed > 0
        ? `Carpeta enviada a papelera junto con ${assetsTrashed} imagen${assetsTrashed === 1 ? '' : 'es'}`
        : 'Carpeta enviada a papelera')
      await reload()
    } catch (err) {
      showNotice('warning', err.message || 'No se pudo enviar la carpeta a la papelera')
    }
  }

  function handleEmptied({ purged = 0, freedBytes = 0, foldersDeleted = 0 } = {}) {
    const parts = [`${purged} archivo${purged === 1 ? '' : 's'} eliminado${purged === 1 ? '' : 's'}`]
    if (foldersDeleted > 0) parts.push(`${foldersDeleted} carpeta${foldersDeleted === 1 ? '' : 's'} eliminada${foldersDeleted === 1 ? '' : 's'}`)
    showNotice('success', `Papelera vaciada · ${parts.join(' · ')} (${formatBytes(freedBytes)} liberados)`)
    reload()
  }

  // ── Exportar (Task 14) ─────────────────────────────────────────────
  // LibraryExportModal hace la descarga (fetch→blob) y, si el toggle
  // "Enviar a papelera tras exportar" está activo, encadena trashAssets —
  // acá sólo formateamos el aviso final a partir del resultado crudo que
  // devuelve, mismo criterio que handleMoveConfirm/handleEmptied.

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
      showNotice('success', 'Exportación descargada')
    } else if (trashResult.trashError) {
      showNotice('warning', `Se exportó, pero no se pudo enviar a la papelera: ${trashResult.trashError}`)
    } else {
      const trashed = Number(trashResult.trashed || 0)
      const kept = Array.isArray(trashResult.kept) ? trashResult.kept : []
      if (kept.length > 0) {
        const names = kept.map((item) => item.fileName || 'archivo').join(', ')
        showNotice(
          'warning',
          `Exportación descargada · ${trashed} enviada${trashed === 1 ? '' : 's'} a papelera · ${kept.length} conservada${kept.length === 1 ? '' : 's'} (usadas en documentos): ${names}`
        )
      } else {
        showNotice('success', `Exportación descargada · ${trashed} enviada${trashed === 1 ? '' : 's'} a papelera`)
      }
    }
    removeFromSelection(exportedIds)
    await reload()
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
  const assetCount = data?.assets?.length ?? 0
  const folderCount = data?.subfolders?.length ?? 0
  const metaText = isTrash
    ? `${assetCount} imagen${assetCount === 1 ? '' : 'es'} en papelera`
    : `${assetCount} imagen${assetCount === 1 ? '' : 'es'} · ${folderCount} carpeta${folderCount === 1 ? '' : 's'}`
  const selectionCount = selectedIds.size

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.pageHeaderInner}>
          <div className={styles.titleRow}>
            <div className={styles.headerMain}>
              <nav className={styles.breadcrumb} aria-label="Carpetas">
                <button type="button" className={styles.breadcrumbLink} onClick={goToRoot}>
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
              </div>
            )}

            {isTrash && canWrite && (
              <div className={styles.headerActions}>
                <Button
                  type="button"
                  variant="danger"
                  icon={<Trash2 size={16} />}
                  onClick={() => setEmptyTrashOpen(true)}
                  disabled={assetCount === 0}
                >
                  Vaciar papelera
                </Button>
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
        <div className={styles.pageBody}>
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

          {canWrite && selectionCount > 0 && (
            <div className={styles.bulkToolbar} role="toolbar" aria-label="Acciones masivas">
              <strong className={styles.bulkInfo}>
                {selectionCount} imagen{selectionCount === 1 ? '' : 'es'} seleccionada{selectionCount === 1 ? '' : 's'}
              </strong>
              <div className={styles.bulkActions}>
                {isTrash ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<RotateCcw size={14} />}
                      onClick={handleRestoreSelected}
                      disabled={bulkBusy}
                    >
                      Restaurar seleccionadas
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearSelection} disabled={bulkBusy}>
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
                      onClick={() => openMoveAssetsModal(Array.from(selectedIds))}
                      disabled={bulkBusy}
                    >
                      Mover
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<Download size={14} />}
                      onClick={() => openExportModal(Array.from(selectedIds))}
                      disabled={bulkBusy}
                    >
                      Exportar
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={() => handleTrashAssets(Array.from(selectedIds))}
                      disabled={bulkBusy}
                    >
                      Papelera
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearSelection} disabled={bulkBusy}>
                      Cancelar
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          <AssetGrid
            folders={data?.subfolders || []}
            assets={data?.assets || []}
            loading={loadState === 'loading'}
            error={loadState === 'error'}
            onRetry={reload}
            onOpenFolder={goToFolder}
            canWrite={canWrite}
            view={view}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelected}
            onRenameAsset={openRenameAsset}
            onMoveAsset={(asset) => openMoveAssetsModal([asset.id])}
            onTrashAsset={(asset) => handleTrashAssets([asset.id])}
            onRenameFolder={openRenameFolder}
            onMoveFolder={openMoveFolderModal}
            onTrashFolder={handleTrashFolder}
          />

          <footer className={styles.footer}>
            <StorageUsageBar usage={data?.usage} />
            <button type="button" className={styles.trashToggle} onClick={toggleTrashView}>
              <Trash2 size={14} aria-hidden="true" />
              {isTrash ? 'Volver a la biblioteca' : 'Papelera'}
            </button>
          </footer>
        </div>
      </UploadDropzone>

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

      {panelVisible && queueItems.length > 0 && (
        <UploadQueuePanel
          items={queueItems}
          onRetry={handleRetryUpload}
          onClose={handleCloseQueuePanel}
          onAllDone={reload}
        />
      )}
    </div>
  )
}
