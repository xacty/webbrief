import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronRight, FolderPlus, Trash2, Upload, X } from 'lucide-react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { Button } from '../components/ui'
import AssetGrid from '../components/library/AssetGrid'
import StorageUsageBar from '../components/library/StorageUsageBar'
import NewFolderModal from '../components/library/NewFolderModal'
import { fetchLibrary } from '../lib/libraryApi'
import styles from './LibraryPage.module.css'

/**
 * Biblioteca de imágenes por empresa. Orquestador: breadcrumb de carpetas
 * (query param `folderId`), filtro de proyecto (`projectId`), vista papelera
 * (`view=trash`), toolbar (Nueva carpeta / Subir imágenes) y barra de uso.
 *
 * Subida (dropzone, cola, panel de progreso), multiselección, mover y
 * export llegan en Tasks 12-14 — este componente solo lista y navega.
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
                {/* Task 12 wires the dropzone/queue + onChange handler here.
                    No handler yet on purpose. */}
                <input
                  type="file"
                  id="library-file-input"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.svg"
                  hidden
                />
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={styles.pageBody}>
        <AssetGrid
          folders={data?.subfolders || []}
          assets={data?.assets || []}
          loading={loadState === 'loading'}
          error={loadState === 'error'}
          onRetry={reload}
          onOpenFolder={goToFolder}
          canWrite={canWrite}
          view={view}
        />

        <footer className={styles.footer}>
          <StorageUsageBar usage={data?.usage} />
          <button type="button" className={styles.trashToggle} onClick={toggleTrashView}>
            <Trash2 size={14} aria-hidden="true" />
            {isTrash ? 'Volver a la biblioteca' : 'Papelera'}
          </button>
        </footer>
      </div>

      <NewFolderModal
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        companyId={companyId}
        parentFolderId={folderId}
        onCreated={reload}
      />
    </div>
  )
}
