import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, ExternalLink, Folder, Images, RefreshCw, Search } from 'lucide-react'
import { Modal, Button, Input } from '../ui'
import { fetchLibrary, searchLibrary } from '../../lib/libraryApi'
import styles from './LibraryPickerModal.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

// Mismo criterio que AssetGrid.assetThumbUrl: los assets de ImageKit reciben
// una transform on-the-fly para el thumbnail; los de Supabase Storage (SVG
// passthrough) se sirven tal cual, sin pipeline de transform para ese bucket.
function assetThumbUrl(asset) {
  if (!asset?.public_url) return null
  if (asset.storage_bucket !== 'imagekit') return asset.public_url
  const separator = asset.public_url.includes('?') ? '&' : '?'
  return `${asset.public_url}${separator}tr=w-300`
}

const SEARCH_MIN_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 300
const SKELETON_COUNT = 10

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Picker de imágenes
 * de la biblioteca de la empresa para insertar en el documento del editor
 * (ver ProjectEditor.jsx Toolbar → handleInsertFromLibrary). Búsqueda con
 * debounce 300ms (searchLibrary) o navegación de carpetas (fetchLibrary) —
 * mutuamente excluyentes: con una query de ≥2 caracteres el grid muestra
 * resultados de búsqueda planos (la API de búsqueda no folder-scopea); al
 * vaciarla vuelve a la carpeta donde se había quedado.
 *
 * No conoce el editor ni la inserción real — `onInsert(asset)` es el único
 * contrato de salida; ProjectEditor.jsx decide cómo construir el nodo.
 */
export default function LibraryPickerModal({ open, onClose, companyId, onInsert, projectLibraryHref = null }) {
  const [folderId, setFolderId] = useState(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [data, setData] = useState(null)
  const [loadState, setLoadState] = useState('loading')
  const [selectedAsset, setSelectedAsset] = useState(null)
  const searchInputRef = useRef(null)
  const requestIdRef = useRef(0)

  // Reset al abrir — no queremos arrastrar la carpeta/selección de la
  // última vez que se abrió el picker en otra parte del documento.
  useEffect(() => {
    if (!open) return
    setFolderId(null)
    setQuery('')
    setDebouncedQuery('')
    setSelectedAsset(null)
  }, [open])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const isSearching = debouncedQuery.length >= SEARCH_MIN_LENGTH

  const reload = useCallback(() => {
    if (!open || !companyId) return
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setLoadState('loading')
    const request = isSearching
      ? searchLibrary(companyId, debouncedQuery)
      : fetchLibrary(companyId, { folderId })
    request
      .then((result) => {
        if (requestIdRef.current !== requestId) return
        setData(result)
        setLoadState('ready')
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return
        setLoadState('error')
      })
  }, [open, companyId, folderId, isSearching, debouncedQuery])

  useEffect(() => {
    reload()
  }, [reload])

  function openFolder(id) {
    setSelectedAsset(null)
    setFolderId(id)
  }

  function handleInsert() {
    if (!selectedAsset) return
    onInsert?.(selectedAsset)
    onClose?.()
  }

  function handlePickAsset(asset) {
    setSelectedAsset(asset)
  }

  function handleInsertImmediately(asset) {
    onInsert?.(asset)
    onClose?.()
  }

  const subfolders = !isSearching ? data?.subfolders || [] : []
  const assets = data?.assets || []
  const breadcrumb = !isSearching ? data?.breadcrumb || [] : []
  const isEmpty = loadState === 'ready' && subfolders.length === 0 && assets.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Insertar desde la biblioteca"
      size="lg"
      initialFocusRef={searchInputRef}
    >
      <div className={styles.toolbar}>
        <Input
          ref={searchInputRef}
          icon={<Search size={16} />}
          placeholder="Buscar imágenes…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {projectLibraryHref && (
          <a
            className={styles.viewProjectLink}
            href={projectLibraryHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver imágenes del proyecto
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>

      {!isSearching && (
        <nav className={styles.breadcrumb} aria-label="Carpetas">
          <button type="button" className={styles.breadcrumbLink} onClick={() => openFolder(null)}>
            Biblioteca
          </button>
          {breadcrumb.map((folder) => (
            <span key={folder.id} className={styles.breadcrumbGroup}>
              <ChevronRight size={12} className={styles.breadcrumbSep} aria-hidden="true" />
              <button type="button" className={styles.breadcrumbLink} onClick={() => openFolder(folder.id)}>
                {folder.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      <div className={styles.gridWrap}>
        {loadState === 'loading' && (
          <div className={styles.grid} aria-busy="true" aria-label="Cargando biblioteca">
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <div key={index} className={styles.skeletonCard} aria-hidden="true" />
            ))}
          </div>
        )}

        {loadState === 'error' && (
          <div className={styles.errorState} role="alert">
            <p className={styles.errorText}>No se pudo cargar la biblioteca.</p>
            <Button type="button" variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={reload}>
              Reintentar
            </Button>
          </div>
        )}

        {loadState === 'ready' && isEmpty && (
          <p className={styles.emptyState}>
            {isSearching ? 'No se encontraron imágenes.' : 'Esta carpeta no tiene imágenes.'}
          </p>
        )}

        {loadState === 'ready' && !isEmpty && (
          <div className={styles.grid}>
            {subfolders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={styles.folderCard}
                onClick={() => openFolder(folder.id)}
              >
                <span className={styles.folderIcon} aria-hidden="true">
                  <Folder size={22} />
                </span>
                <span className={styles.cardName}>{folder.name}</span>
              </button>
            ))}
            {assets.map((asset) => {
              const thumb = assetThumbUrl(asset)
              const isSelected = selectedAsset?.id === asset.id
              return (
                <button
                  key={asset.id}
                  type="button"
                  aria-pressed={isSelected}
                  className={cx(styles.assetCard, isSelected && styles.assetCardSelected)}
                  onClick={() => handlePickAsset(asset)}
                  onDoubleClick={() => handleInsertImmediately(asset)}
                  title={asset.file_name}
                >
                  <span className={styles.thumbWrap}>
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" className={styles.thumb} />
                    ) : (
                      <span className={styles.thumbFallback} aria-hidden="true">
                        <Images size={20} />
                      </span>
                    )}
                  </span>
                  <span className={styles.cardName}>{asset.file_name}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="button" variant="primary" disabled={!selectedAsset} onClick={handleInsert}>
          Insertar
        </Button>
      </div>
    </Modal>
  )
}
