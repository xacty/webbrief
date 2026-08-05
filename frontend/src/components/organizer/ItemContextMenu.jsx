import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './ItemContextMenu.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const MENU_WIDTH = 220
const MARGIN = 8

// Posición inicial del cursor: clamp horizontal solamente. El alto real se
// mide en useLayoutEffect después del render para el flip vertical preciso
// — misma técnica que EditorContextMenu.jsx (frontend/src/components/editor/),
// reusada acá porque resuelve exactamente el mismo problema (menú de
// cursor que no debe salirse del viewport en ningún borde).
function initialPos(x, y, w = MENU_WIDTH) {
  const left = Math.max(MARGIN, Math.min(x, window.innerWidth - w - MARGIN))
  return { left, top: y }
}

function MenuItem({ icon: Icon, label, onSelect, disabled, destructive }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cx(styles.item, destructive && styles.itemDestructive, disabled && styles.itemDisabled)}
      onMouseDown={(event) => {
        event.preventDefault()
        if (disabled) return
        onSelect?.()
      }}
      disabled={disabled}
    >
      {Icon && (
        <span className={styles.icon} aria-hidden="true">
          <Icon size={14} />
        </span>
      )}
      <span className={styles.label}>{label}</span>
    </button>
  )
}

function Separator() {
  return <div className={styles.separator} role="separator" />
}

/**
 * Right-click customizado, genérico (O2.a — extraído de
 * `library/LibraryContextMenu.jsx`, iteración UX F1 punto 4). Portal a
 * body, posición del cursor con clamp+flip al viewport (técnica de
 * EditorContextMenu — ver initialPos/useLayoutEffect arriba), cierra con
 * click fuera / ESC / scroll (EditorContextMenu no cierra en scroll; acá sí
 * hace falta porque este menú convive con el scroll normal de la página,
 * no con un canvas de edición que scrollea internamente).
 *
 * A diferencia del original, este componente NO conoce el dominio (assets,
 * carpetas, proyectos, etc.) — recibe `items`, una lista PLANA de
 * descriptores que el caller arma según su propio estado (selección, kind
 * de target...). Cada entrada es una de:
 *   { type: 'item', icon?, label, onSelect, disabled?, destructive? }
 *   { type: 'header', label }       — fila no-clickable (p. ej. "N seleccionadas")
 *   { type: 'separator' }
 *
 * El wrapping "cerrar el menú y RECIÉN DESPUÉS ejecutar la acción" (evita
 * que el menú siga montado mientras la acción muta estado) es responsabilidad
 * de ESTE componente, no del caller — mismo comportamiento que el `close()`
 * original, ahora aplicado genéricamente a cualquier `onSelect`.
 */
export default function ItemContextMenu({ open, position, items = [], onClose }) {
  const menuRef = useRef(null)
  const [adjustedPos, setAdjustedPos] = useState(null)

  useEffect(() => {
    if (!open) {
      setAdjustedPos(null)
      return undefined
    }
    function handleDown(event) {
      if (!menuRef.current?.contains(event.target)) onClose?.()
    }
    function handleEsc(event) {
      if (event.key === 'Escape') onClose?.()
    }
    function handleScroll() {
      onClose?.()
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleEsc)
    window.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleEsc)
      window.removeEventListener('scroll', handleScroll, true)
    }
  }, [open, onClose])

  // Mide el menú real después del render y flip vertical/horizontal si no
  // hay espacio — mismo criterio que EditorContextMenu.
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !position) return
    const rect = menuRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const desiredTop = position.y
    const fitsBelow = desiredTop + rect.height + MARGIN <= viewportH
    let top
    if (fitsBelow) {
      top = desiredTop
    } else {
      const upwardTop = desiredTop - rect.height
      top = upwardTop >= MARGIN ? upwardTop : Math.max(MARGIN, viewportH - rect.height - MARGIN)
    }
    const left = Math.max(MARGIN, Math.min(position.x, window.innerWidth - rect.width - MARGIN))
    setAdjustedPos({ left, top })
  }, [open, position?.x, position?.y])

  if (!open || !items.length || !position || typeof document === 'undefined') return null

  const pos = adjustedPos || initialPos(position.x, position.y)

  function close(action) {
    return (...args) => {
      onClose?.()
      action?.(...args)
    }
  }

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: pos.left, top: pos.top, visibility: adjustedPos ? 'visible' : 'hidden' }}
      role="menu"
      aria-label="Acciones"
    >
      {items.map((entry, index) => {
        if (entry.type === 'separator') return <Separator key={index} />
        if (entry.type === 'header') {
          return (
            <div key={index} className={styles.header}>
              {entry.label}
            </div>
          )
        }
        return (
          <MenuItem
            key={index}
            icon={entry.icon}
            label={entry.label}
            disabled={entry.disabled}
            destructive={entry.destructive}
            onSelect={close(entry.onSelect)}
          />
        )
      })}
    </div>,
    document.body
  )
}
