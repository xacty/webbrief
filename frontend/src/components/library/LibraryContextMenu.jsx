import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Download, Eye, FolderOpen, Info, Move, Pencil, RotateCcw, Trash2, XCircle,
} from 'lucide-react'
import styles from './LibraryContextMenu.module.css'

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
 * Right-click customizado (iteración UX F1, punto 4). Portal a body,
 * posición del cursor con clamp+flip al viewport (técnica de
 * EditorContextMenu — ver initialPos/useLayoutEffect arriba), cierra con
 * click fuera / ESC / scroll (EditorContextMenu no cierra en scroll; acá sí
 * hace falta porque este menú convive con el scroll normal de la página,
 * no con un canvas de edición que scrollea internamente).
 *
 * `menu` describe QUÉ mostrar — LibraryPage arma este objeto en
 * openAssetContextMenu/openFolderContextMenu según dónde cayó el
 * right-click y si ese target participa de la selección activa:
 *   { kind: 'asset',           asset, index, ids: [asset.id] }
 *   { kind: 'selection',       ids }                              (≥2 seleccionadas, right-click sobre una seleccionada)
 *   { kind: 'folder',          folder }
 *   { kind: 'trash-asset',     asset, ids: [asset.id] }
 *   { kind: 'trash-selection', ids }
 *
 * Este componente NO conoce selectedIds ni reglas de negocio — sólo
 * renderiza los items para el `kind` recibido y delega cada acción a los
 * callbacks (mismos handlers que ya usan el kebab/toolbar, ver
 * LibraryPage.jsx — un solo chokepoint por acción, no una copia paralela).
 */
export default function LibraryContextMenu({
  open,
  position,
  menu,
  onClose,
  onPreview,
  onInfo,
  onRename,
  onMove,
  onExport,
  onTrash,
  onDeselectAll,
  onOpenFolder,
  onRenameFolder,
  onMoveFolder,
  onTrashFolder,
  onRestore,
}) {
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

  if (!open || !menu || !position || typeof document === 'undefined') return null

  const pos = adjustedPos || initialPos(position.x, position.y)

  function close(action) {
    return (...args) => {
      onClose?.()
      action?.(...args)
    }
  }

  function renderItems() {
    switch (menu.kind) {
      case 'asset': {
        const { asset, index, ids } = menu
        return (
          <>
            <MenuItem icon={Eye} label="Vista previa" onSelect={close(() => onPreview?.(index))} />
            <MenuItem icon={Info} label="Información" onSelect={close(() => onInfo?.(asset))} />
            <Separator />
            <MenuItem icon={Pencil} label="Renombrar" onSelect={close(() => onRename?.(asset))} />
            <MenuItem icon={Move} label="Mover a carpeta" onSelect={close(() => onMove?.(ids))} />
            <MenuItem icon={Download} label="Exportar" onSelect={close(() => onExport?.(ids))} />
            <Separator />
            <MenuItem icon={Trash2} label="Enviar a papelera" destructive onSelect={close(() => onTrash?.(ids))} />
          </>
        )
      }
      case 'selection': {
        const { ids } = menu
        return (
          <>
            <div className={styles.header}>{ids.length} seleccionadas</div>
            <Separator />
            <MenuItem icon={Move} label="Mover" onSelect={close(() => onMove?.(ids))} />
            <MenuItem icon={Download} label="Exportar" onSelect={close(() => onExport?.(ids))} />
            <MenuItem icon={Trash2} label="Enviar a papelera" destructive onSelect={close(() => onTrash?.(ids))} />
            <Separator />
            <MenuItem icon={XCircle} label="Deseleccionar todo" onSelect={close(() => onDeselectAll?.())} />
          </>
        )
      }
      case 'folder': {
        const { folder } = menu
        return (
          <>
            <MenuItem icon={FolderOpen} label="Abrir" onSelect={close(() => onOpenFolder?.(folder.id))} />
            <Separator />
            <MenuItem icon={Pencil} label="Renombrar" onSelect={close(() => onRenameFolder?.(folder))} />
            <MenuItem icon={Move} label="Mover" onSelect={close(() => onMoveFolder?.(folder))} />
            <Separator />
            <MenuItem icon={Trash2} label="Enviar a papelera" destructive onSelect={close(() => onTrashFolder?.(folder))} />
          </>
        )
      }
      case 'trash-asset': {
        const { ids } = menu
        return <MenuItem icon={RotateCcw} label="Restaurar" onSelect={close(() => onRestore?.(ids))} />
      }
      case 'trash-selection': {
        const { ids } = menu
        return <MenuItem icon={RotateCcw} label={`Restaurar ${ids.length}`} onSelect={close(() => onRestore?.(ids))} />
      }
      default:
        return null
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
      {renderItems()}
    </div>,
    document.body
  )
}
