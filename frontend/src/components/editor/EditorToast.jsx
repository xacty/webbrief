import { AlertTriangle, Info, X } from 'lucide-react'
import styles from './EditorToast.module.css'

function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

/**
 * EditorToast — aviso flotante fuera de la navbar, ver
 * DESIGN-SYSTEM.md §"Component patterns". Un solo toast a la vez: el
 * llamador (`showToast` en ProjectEditor) reemplaza el anterior en vez de
 * apilar. `kind: 'warning'` persiste hasta que el usuario lo cierra;
 * `kind: 'info'` se auto-oculta (ver `showToast`).
 */
export default function EditorToast({ toast, onDismiss }) {
  if (!toast) return null
  const isWarning = toast.kind === 'warning'

  return (
    <div
      className={cn(styles.toast, isWarning ? styles.warning : styles.info)}
      role={isWarning ? 'alert' : 'status'}
      aria-live="polite"
    >
      {isWarning ? <AlertTriangle size={15} /> : <Info size={15} />}
      <span className={styles.text}>{toast.text}</span>
      {toast.actionLabel && (
        <button type="button" className={styles.action} onClick={toast.onAction}>
          {toast.actionLabel}
        </button>
      )}
      <button type="button" className={styles.close} onClick={onDismiss} aria-label="Cerrar aviso">
        <X size={13} />
      </button>
    </div>
  )
}
