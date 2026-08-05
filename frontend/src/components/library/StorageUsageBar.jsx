import styles from './StorageUsageBar.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const MB = 1024 * 1024

function mb(bytes) {
  const value = (bytes || 0) / MB
  if (value === 0) return '0'
  if (value < 10) return value.toFixed(1).replace('.', ',').replace(',0', '')
  return String(Math.round(value))
}

/**
 * Medidor de almacenamiento por empresa, segmentado por categoría
 * (estilo "qué ocupa espacio"): Biblioteca · En documentos · Adjuntos de
 * brief · Papelera. `usage` es el shape de GET /api/companies/:id/library
 * (summarizeUsage + quotaMb). El semáforo de alerta vive en el TEXTO
 * (ámbar ≥80%, rojo al 100%) para no competir con los colores de categoría.
 */
export default function StorageUsageBar({ usage, onGoLibrary, onGoTrash, onEmptyTrash }) {
  if (!usage) return null

  const quotaMb = usage.quotaMb || 100
  const quotaBytes = quotaMb * MB
  const used = usage.usedBytes || 0
  const pct = quotaBytes > 0 ? Math.min(100, (used / quotaBytes) * 100) : 0
  const level = pct >= 100 ? 'full' : pct >= 80 ? 'warn' : 'ok'

  const segments = [
    {
      key: 'library',
      label: 'Biblioteca',
      bytes: usage.libraryBytes || 0,
      count: usage.counts?.library || 0,
      className: styles.segLibrary,
      dotClassName: styles.dotLibrary,
      hint: 'Imágenes en la biblioteca de la empresa',
      onClick: onGoLibrary,
    },
    {
      key: 'document',
      label: 'En documentos',
      bytes: usage.documentBytes || 0,
      count: usage.counts?.document || 0,
      className: styles.segDocument,
      dotClassName: styles.dotDocument,
      hint: 'Imágenes insertadas en páginas de proyectos',
    },
    {
      key: 'brief',
      label: 'Adjuntos de brief',
      bytes: usage.briefBytes || 0,
      count: usage.counts?.brief || 0,
      className: styles.segBrief,
      dotClassName: styles.dotBrief,
      hint: 'Archivos adjuntados en respuestas de briefs',
    },
    {
      key: 'trashed',
      label: 'Papelera',
      bytes: usage.trashedBytes || 0,
      count: usage.counts?.trashed || 0,
      className: styles.segTrashed,
      dotClassName: styles.dotTrashed,
      hint: 'Recuperables por 30 días; vaciar la papelera libera el espacio',
      onClick: onGoTrash,
    },
  ].filter((segment) => segment.bytes > 0)

  const freeBytes = Math.max(0, quotaBytes - used)
  const showEmptyTrashCta = level !== 'ok' && (usage.trashedBytes || 0) > 0 && typeof onEmptyTrash === 'function'

  return (
    <div className={styles.wrap} role="status" aria-label="Uso de almacenamiento">
      <div className={styles.meterRow}>
        <div className={styles.track}>
          {segments.map((segment) => (
            <div
              key={segment.key}
              className={cx(styles.segment, segment.className)}
              style={{ '--seg-pct': `${(segment.bytes / quotaBytes) * 100}%` }}
              title={`${segment.label} · ${mb(segment.bytes)} MB · ${segment.count} ${segment.count === 1 ? 'archivo' : 'archivos'}`}
              aria-hidden="true"
            />
          ))}
        </div>
        <span className={cx(styles.label, level === 'warn' && styles.labelWarn, level === 'full' && styles.labelFull)}>
          {mb(used)} de {quotaMb} MB
          {level === 'warn' && ' · casi lleno'}
          {level === 'full' && ' · lleno'}
        </span>
      </div>
      {segments.length > 0 && (
        <div className={styles.legend}>
          {segments.map((segment) => {
            const content = (
              <>
                <span className={cx(styles.dot, segment.dotClassName)} aria-hidden="true" />
                {segment.label} <span className={styles.legendBytes}>{mb(segment.bytes)} MB</span>
              </>
            )
            return segment.onClick ? (
              <button
                key={segment.key}
                type="button"
                className={cx(styles.legendItem, styles.legendItemClickable)}
                title={segment.hint}
                onClick={segment.onClick}
              >
                {content}
              </button>
            ) : (
              <span key={segment.key} className={styles.legendItem} title={segment.hint}>
                {content}
              </span>
            )
          })}
          <span className={styles.legendItem}>
            <span className={cx(styles.dot, styles.dotFree)} aria-hidden="true" />
            Libre <span className={styles.legendBytes}>{mb(freeBytes)} MB</span>
          </span>
          {showEmptyTrashCta && (
            <button type="button" className={styles.emptyTrashCta} onClick={onEmptyTrash}>
              Vaciar papelera y liberar {mb(usage.trashedBytes)} MB →
            </button>
          )}
        </div>
      )}
    </div>
  )
}
