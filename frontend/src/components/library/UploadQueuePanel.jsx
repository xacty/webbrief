import { useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react'
import { EXCLUDE_REASON_LABELS, formatBytes, formatSavings } from '../../lib/uploadQueue'
import styles from './UploadQueuePanel.module.css'

const ACTIVE_STATUSES = new Set(['queued', 'uploading', 'converting'])

/**
 * Panel flotante bottom-right con el progreso de la cola de subida
 * (frontend/src/lib/uploadQueue.js). No bloqueante: se puede minimizar o
 * cerrar mientras las subidas siguen en curso en segundo plano.
 *
 * Nota de diseño: "cerrar" sólo oculta el panel (LibraryPage deja de
 * montarlo) — no cancela nada, la cola sigue corriendo vía queueRef. Si se
 * cierra con subidas activas, ese lote deja de disparar onAllDone al
 * terminar (nadie está escuchando); es la contrapartida aceptada de que el
 * cierre esté permitido con confirmación en vez de bloqueado del todo.
 */
export default function UploadQueuePanel({ items = [], onRetry, onClose, onAllDone }) {
  const [minimized, setMinimized] = useState(false)
  const wasActiveRef = useRef(false)

  const total = items.length
  const activeCount = items.filter((item) => ACTIVE_STATUSES.has(item.status)).length
  const hasActive = activeCount > 0
  const settled = total - activeCount
  const doneItems = items.filter((item) => item.status === 'done')
  const errorCount = items.filter((item) => item.status === 'error').length
  const excludedCount = items.filter((item) => item.status === 'excluded').length

  // Transición "había activos" -> "ya no hay ninguno": avisa a LibraryPage
  // para que recargue el listado (las imágenes nuevas ya están escritas en
  // project_assets). Vive en un efecto (no en el cuerpo del render) para
  // no llamar un setState del padre durante el render de este componente.
  useEffect(() => {
    if (wasActiveRef.current && !hasActive && total > 0) onAllDone?.()
    wasActiveRef.current = hasActive
  }, [hasActive, total, onAllDone])

  if (total === 0) return null

  const savingsTotals = doneItems.reduce(
    (acc, item) => {
      const savings = item.result?.savings
      if (!savings) return acc
      acc.original += savings.originalBytes
      acc.final += savings.finalBytes
      acc.count += 1
      return acc
    },
    { original: 0, final: 0, count: 0 }
  )

  let headerTitle = `Subiendo ${settled} de ${total}`
  if (!hasActive) {
    headerTitle = doneItems.length > 0 ? 'Subida completa' : 'Subida terminada'
    if (savingsTotals.count > 0) {
      headerTitle += ` · ahorro ${formatBytes(savingsTotals.original)} → ${formatBytes(savingsTotals.final)}`
    }
  }
  const issueCount = errorCount + excludedCount

  function handleClose() {
    if (hasActive) {
      const confirmed = window.confirm(
        'Hay imágenes subiéndose. Si cierras el panel, la subida continuará en segundo plano. ¿Cerrar de todas formas?'
      )
      if (!confirmed) return
    }
    onClose?.()
  }

  return (
    <div className={styles.panel} role="status" aria-live="polite">
      <div className={styles.header}>
        <div className={styles.headerText}>
          <p className={styles.headerTitle}>{headerTitle}</p>
          {!hasActive && issueCount > 0 && (
            <p className={styles.headerSubtitle}>
              {issueCount} imagen{issueCount === 1 ? '' : 'es'} no se {issueCount === 1 ? 'subió' : 'subieron'}
            </p>
          )}
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => setMinimized((prev) => !prev)}
            aria-label={minimized ? 'Expandir panel de subida' : 'Minimizar panel de subida'}
          >
            {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
          <button type="button" className={styles.iconButton} onClick={handleClose} aria-label="Cerrar panel de subida">
            <X size={16} />
          </button>
        </div>
      </div>

      {!minimized && (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.row}>
              <span className={styles.rowName} title={item.file.name}>
                {item.file.name}
              </span>

              {(item.status === 'queued' || item.status === 'uploading') && (
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ '--fill-pct': `${item.progress || 0}%` }} />
                </div>
              )}

              {item.status === 'converting' && <span className={styles.rowMuted}>Convirtiendo…</span>}

              {item.status === 'done' && (
                <span className={styles.rowDone}>
                  <CheckCircle2 size={14} className={styles.doneIcon} aria-hidden="true" />
                  {item.result?.savings
                    ? formatSavings(item.result.savings.originalBytes, item.result.savings.finalBytes)
                    : 'Listo'}
                </span>
              )}

              {item.status === 'error' && (
                <span className={styles.rowError}>
                  <AlertCircle size={14} className={styles.errorIcon} aria-hidden="true" />
                  <span className={styles.rowErrorText} title={item.error}>
                    {item.error}
                  </span>
                  <button type="button" className={styles.retryButton} onClick={() => onRetry?.(item.id)}>
                    <RotateCcw size={12} aria-hidden="true" />
                    Reintentar
                  </button>
                </span>
              )}

              {item.status === 'excluded' && (
                <span className={styles.rowExcluded}>
                  <AlertTriangle size={14} className={styles.excludedIcon} aria-hidden="true" />
                  {EXCLUDE_REASON_LABELS[item.reason] || 'No compatible'}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
