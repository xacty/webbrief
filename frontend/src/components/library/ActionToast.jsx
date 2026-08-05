import { X } from 'lucide-react'
import { Button } from '../ui'
import styles from './ActionToast.module.css'

/**
 * Toast flotante inferior con Deshacer (iteración UX F1, punto 2).
 *
 * Reemplaza el banner superior (`showNotice`) de LibraryPage para las
 * acciones de mover/papelera — ver el comentario de sección en
 * LibraryPage.jsx ("Toast de acción con Deshacer"). El banner se conserva
 * SOLO para errores y para el resto de la página; este componente es
 * deliberadamente scoped a la biblioteca (no es un sistema global de
 * toasts — DESIGN-SYSTEM.md documenta que el resto del shell usa banners
 * inline; ésta es la excepción explícita pedida por el dueño de producto
 * para dar una red de seguridad inmediata en acciones de mover/papelera).
 *
 * `toast` es `{ id, message, subMessage?, onUndo? } | null`. El botón
 * "Deshacer" sólo se renderiza cuando `onUndo` está presente — algunas
 * acciones (p. ej. enviar una carpeta a papelera, vaciar la papelera) usan
 * el mismo toast como feedback liviano sin ofrecer deshacer. El auto-cierre
 * a los 15s y la limpieza del timer viven en LibraryPage (ver `showActionToast`
 * / `useEffect` keyed en `toast?.id`) — este componente es puramente
 * presentacional.
 */
export default function ActionToast({ toast, onUndo, onClose }) {
  if (!toast) return null

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <div className={styles.textGroup}>
        <span className={styles.message}>{toast.message}</span>
        {toast.subMessage && <span className={styles.subMessage}>{toast.subMessage}</span>}
      </div>

      <div className={styles.actions}>
        {toast.onUndo && (
          <Button type="button" variant="ghost" size="sm" className={styles.undoButton} onClick={onUndo}>
            Deshacer
          </Button>
        )}
        <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Cerrar aviso">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
