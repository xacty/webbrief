import { Download, FolderOpen } from 'lucide-react'
import { Button } from '../ui'
import EmptyState from '../onboarding/EmptyState'
import AssetGrid from './AssetGrid'
import { isImageAsset } from '../../lib/libraryAssetUtils'
import styles from './ProjectAssetGroups.module.css'

/**
 * Render agrupado por proyecto de los tabs Documentos y Briefs de la galería
 * ("Ola B"). Solo-lectura + export: cada grupo es un encabezado (nombre del
 * proyecto + conteo + "Descargar todas") sobre un `AssetGrid` con el set de
 * acciones REDUCIDO — sin renombrar, mover ni papelera (esos archivos viven
 * dentro de documentos o son material recibido).
 *
 * Los índices que se pasan a `onOpenLightbox` / `onAssetContextMenu` son
 * POSICIONALES sobre la lista aplanada de todos los grupos (el mismo orden
 * que LibraryPage usa para el Lightbox), no locales al grupo — de ahí el
 * offset acumulado.
 */
export default function ProjectAssetGroups({
  groups = [],
  section = 'documents',
  loading = false,
  error = false,
  onRetry,
  canWrite = false,
  layout = 'grid',
  sortField = 'date',
  sortDir = 'desc',
  onSortFieldClick,
  selectedIds,
  onToggleSelect,
  onOpenLightbox,
  onInfoAsset,
  onExportAsset,
  onExportGroup,
  onDownloadAsset,
  onGoToDocument,
  onAssetContextMenu,
}) {
  if (loading || error) {
    return (
      <AssetGrid
        folders={[]}
        assets={[]}
        totalAssetCount={0}
        loading={loading}
        error={error}
        onRetry={onRetry}
      />
    )
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={section === 'briefs' ? 'Sin adjuntos de brief' : 'Sin imágenes en documentos'}
        body={section === 'briefs'
          ? 'Los archivos que los clientes adjunten al responder un brief aparecen aquí.'
          : 'Las imágenes que insertes en las páginas de un proyecto aparecen aquí.'}
      />
    )
  }

  const unit = section === 'briefs' ? 'archivo' : 'imagen'
  const unitPlural = section === 'briefs' ? 'archivos' : 'imágenes'

  let offset = 0

  return (
    <div className={styles.groups}>
      {groups.map((group) => {
        const start = offset
        offset += group.assets.length
        const count = group.assets.length
        // El ZIP de export pasa por transformaciones de ImageKit: sólo tiene
        // sentido para imágenes. Los no-imagen (PDF/Office de briefs) se
        // bajan de a uno con "Descargar" desde su propio kebab.
        const exportableIds = group.assets.filter(isImageAsset).map((asset) => asset.id)

        return (
          <section key={group.key} className={styles.group}>
            <header className={styles.groupHeader}>
              <div className={styles.groupTitleBlock}>
                <h2 className={styles.groupTitle}>{group.name}</h2>
                <p className={styles.groupMeta}>{count} {count === 1 ? unit : unitPlural}</p>
              </div>
              {exportableIds.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  icon={<Download size={14} />}
                  onClick={() => onExportGroup?.(exportableIds)}
                >
                  Descargar todas ({exportableIds.length})
                </Button>
              )}
            </header>

            <AssetGrid
              folders={[]}
              assets={group.assets}
              totalAssetCount={count}
              canWrite={canWrite}
              readOnlyActions
              allowDrag={false}
              layout={layout}
              sortField={sortField}
              sortDir={sortDir}
              onSortFieldClick={onSortFieldClick}
              selectedIds={selectedIds}
              onToggleSelect={onToggleSelect}
              onOpenLightbox={(index) => onOpenLightbox?.(start + index)}
              onInfoAsset={onInfoAsset}
              onExportAsset={onExportAsset}
              onDownloadAsset={onDownloadAsset}
              onGoToDocument={onGoToDocument}
              onAssetContextMenu={(event, asset, index) => onAssetContextMenu?.(event, asset, start + index)}
            />
          </section>
        )
      })}
    </div>
  )
}
