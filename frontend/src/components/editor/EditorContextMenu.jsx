import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bold, Italic, Underline, Strikethrough,
  Scissors, Copy, ClipboardPaste, Trash2,
  MessageSquare, Link2, Eraser, Type, ChevronRight,
} from 'lucide-react'
import styles from './EditorContextMenu.module.css'

const MENU_WIDTH = 240
const SUBMENU_WIDTH = 200
const MARGIN = 8

// Posición inicial del cursor: clamp horizontal solamente.
// El alto se mide en useLayoutEffect después del render para flip vertical preciso.
function initialPos(x, y, w = MENU_WIDTH) {
  const left = Math.max(MARGIN, Math.min(x, window.innerWidth - w - MARGIN))
  return { left, top: y }
}

function MenuItem({ icon: Icon, label, shortcut, onSelect, disabled, danger, hasSubmenu, onMouseEnter }) {
  return (
    <button
      type="button"
      className={[styles.item, disabled && styles.itemDisabled, danger && styles.itemDanger].filter(Boolean).join(' ')}
      onMouseDown={(e) => { e.preventDefault(); if (disabled) return; onSelect?.() }}
      onMouseEnter={onMouseEnter}
      disabled={disabled}
    >
      <span className={styles.icon}>{Icon ? <Icon size={14} /> : null}</span>
      <span className={styles.label}>{label}</span>
      {shortcut && <span className={styles.shortcut}>{shortcut}</span>}
      {hasSubmenu && <ChevronRight size={12} className={styles.submenuChevron} />}
    </button>
  )
}

function Separator() {
  return <div className={styles.separator} />
}

export default function EditorContextMenu({ open, position, editor, onClose, onAddComment, canComment = false, selectionSnapshot = null }) {
  const menuRef = useRef(null)
  const submenuWrapperRef = useRef(null)
  const [submenu, setSubmenu] = useState(null) // 'block' | null
  const [adjustedPos, setAdjustedPos] = useState(null)
  // Vertical distance from the "Tipo de bloque" row's bottom edge to the
  // parent menu's bottom edge. Used to anchor the submenu's BOTTOM at the
  // parent menu's BOTTOM, so the submenu always lives in the same vertical
  // band as the parent and never clips below the viewport when the menu is
  // near the bottom of the screen.
  const [submenuBottomOffset, setSubmenuBottomOffset] = useState(0)

  useEffect(() => {
    if (!open) return
    function handleDown(e) {
      if (!menuRef.current?.contains(e.target)) onClose?.()
    }
    function handleEsc(e) {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('mousedown', handleDown)
    document.addEventListener('keydown', handleEsc)
    return () => {
      document.removeEventListener('mousedown', handleDown)
      document.removeEventListener('keydown', handleEsc)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      setSubmenu(null)
      setAdjustedPos(null)
    }
  }, [open])

  // Mide el menú real después del render y flip vertical si no hay espacio abajo.
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    const rect = menuRef.current.getBoundingClientRect()
    const viewportH = window.innerHeight
    const desiredTop = position.y
    const fitsBelow = desiredTop + rect.height + MARGIN <= viewportH
    let top
    if (fitsBelow) {
      top = desiredTop
    } else {
      // Try opening upward (anchor menu bottom at click point)
      const upwardTop = desiredTop - rect.height
      if (upwardTop >= MARGIN) {
        top = upwardTop
      } else {
        // No room either way — pin to viewport with margin
        top = Math.max(MARGIN, viewportH - rect.height - MARGIN)
      }
    }
    const left = Math.max(MARGIN, Math.min(position.x, window.innerWidth - rect.width - MARGIN))
    setAdjustedPos({ left, top })

    // Measure how far below the "Tipo de bloque" wrapper row the parent
    // menu extends. This delta is invariant for a given menu structure
    // (depends only on how many items are below the wrapper), so one
    // measurement is enough — even if the menu later flips vertically.
    if (submenuWrapperRef.current) {
      const wrapperRect = submenuWrapperRef.current.getBoundingClientRect()
      setSubmenuBottomOffset(Math.max(0, rect.bottom - wrapperRect.bottom))
    }
  }, [open, position.x, position.y])

  const isMac = useMemo(() => /Mac|iPod|iPhone|iPad/.test(navigator.platform), [])
  const mod = isMac ? '⌘' : 'Ctrl'

  if (!open || !editor) return null
  const pos = adjustedPos || initialPos(position.x, position.y)

  // Selección efectiva: usa el snapshot capturado al abrir el menú (más confiable
  // que leer editor.state.selection ahora, ya que algún paint/event entre abrir
  // el menú y este render podría haberla mutado).
  const snap = selectionSnapshot || { from: 0, to: 0, empty: true }
  const hasSelection = !snap.empty
  const snapFrom = snap.from
  const snapTo = snap.to

  // Restaura la selección capturada antes de correr el comando, así cualquier
  // acción que dependa del rango (cut/copy/delete/comentar/link) opera sobre
  // el texto que el usuario tenía seleccionado al hacer right-click.
  function restoreSelection() {
    if (!editor) return
    if (snap.empty) {
      editor.chain().focus().setTextSelection(snapFrom).run()
    } else {
      editor.chain().focus().setTextSelection({ from: snapFrom, to: snapTo }).run()
    }
  }

  async function safeRun(fn) {
    try {
      restoreSelection()
      await fn()
    } catch (err) {
      console.warn('[ctxmenu] action failed:', err.message)
    }
    onClose?.()
  }

  function handleCut() {
    safeRun(async () => {
      if (snap.empty) return
      const text = editor.state.doc.textBetween(snapFrom, snapTo, ' ', ' ')
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
        else document.execCommand('copy')
      } catch {/* ignore */}
      editor.chain().focus().deleteSelection().run()
    })
  }

  function handleCopy() {
    safeRun(async () => {
      if (snap.empty) return
      const text = editor.state.doc.textBetween(snapFrom, snapTo, ' ', ' ')
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
        else document.execCommand('copy')
      } catch {/* ignore */}
    })
  }

  function handlePaste() {
    safeRun(async () => {
      try {
        const text = await navigator.clipboard.readText()
        if (text) editor.chain().focus().insertContent(text).run()
      } catch {
        window.alert('Tu navegador bloqueó el acceso al portapapeles. Usá ' + mod + '+V.')
      }
    })
  }

  function handlePastePlain() {
    safeRun(async () => {
      try {
        const text = await navigator.clipboard.readText()
        if (text) {
          editor.chain().focus().insertContent({ type: 'text', text }).run()
        }
      } catch {
        window.alert('Tu navegador bloqueó el acceso al portapapeles. Usá ' + mod + '+Shift+V.')
      }
    })
  }

  function handleDelete() {
    safeRun(() => editor.chain().focus().deleteSelection().run())
  }

  function handleAddCommentClick() {
    if (!snap.empty) {
      editor.chain().focus().setTextSelection({ from: snapFrom, to: snapTo }).run()
    }
    onClose?.()
    // Defer so the editor selection is committed before the composer reads it.
    window.setTimeout(() => onAddComment?.(), 0)
  }

  function handleInsertLink() {
    safeRun(() => {
      const url = window.prompt('URL del enlace:')
      if (!url) return
      editor.chain().focus().setLink({ href: url }).run()
    })
  }

  function handleClearFormatting() {
    safeRun(() => editor.chain().focus().unsetAllMarks().clearNodes().run())
  }

  function handleBlockType(type) {
    safeRun(() => {
      if (type === 'paragraph') editor.chain().focus().setParagraph().run()
      else editor.chain().focus().setHeading({ level: parseInt(type) }).run()
    })
  }

  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ left: pos.left, top: pos.top, visibility: adjustedPos ? 'visible' : 'hidden' }}
      role="menu"
    >
      <MenuItem icon={Scissors} label="Cortar" shortcut={`${mod}+X`} onSelect={handleCut} disabled={!hasSelection} />
      <MenuItem icon={Copy} label="Copiar" shortcut={`${mod}+C`} onSelect={handleCopy} disabled={!hasSelection} />
      <MenuItem icon={ClipboardPaste} label="Pegar" shortcut={`${mod}+V`} onSelect={handlePaste} />
      <MenuItem icon={ClipboardPaste} label="Pegar sin formato" shortcut={`${mod}+Shift+V`} onSelect={handlePastePlain} />
      <MenuItem icon={Trash2} label="Eliminar" onSelect={handleDelete} disabled={!hasSelection} />
      <Separator />
      <MenuItem
        icon={MessageSquare}
        label="Comentar"
        shortcut={`${mod}+Alt+M`}
        onSelect={handleAddCommentClick}
        disabled={!hasSelection || !canComment}
      />
      <MenuItem icon={Link2} label="Insertar enlace" shortcut={`${mod}+K`} onSelect={handleInsertLink} disabled={!hasSelection} />
      <Separator />
      <MenuItem
        icon={Bold}
        label="Negrita"
        shortcut={`${mod}+B`}
        onSelect={() => safeRun(() => editor.chain().focus().toggleBold().run())}
      />
      <MenuItem
        icon={Italic}
        label="Itálica"
        shortcut={`${mod}+I`}
        onSelect={() => safeRun(() => editor.chain().focus().toggleItalic().run())}
      />
      <MenuItem
        icon={Underline}
        label="Subrayado"
        shortcut={`${mod}+U`}
        onSelect={() => safeRun(() => editor.chain().focus().toggleUnderline().run())}
      />
      <MenuItem
        icon={Strikethrough}
        label="Tachado"
        shortcut={`${mod}+Shift+X`}
        onSelect={() => safeRun(() => editor.chain().focus().toggleStrike().run())}
      />
      <Separator />
      <div
        ref={submenuWrapperRef}
        className={styles.submenuWrapper}
        onMouseEnter={() => setSubmenu('block')}
        onMouseLeave={() => setSubmenu(null)}
      >
        <MenuItem
          icon={Type}
          label="Tipo de bloque"
          hasSubmenu
        />
        {submenu === 'block' && (
          <div
            className={styles.submenu}
            // `bottom: -submenuBottomOffset` anchors the submenu's bottom
            // edge at the parent menu's bottom edge (offset is the gap
            // between the wrapper row's bottom and the menu's bottom).
            // The submenu then sizes upward from there — its top floats
            // up automatically based on how many items it has — so the
            // submenu and parent menu always share the same lower edge,
            // and the submenu never clips below the viewport.
            style={{ left: '100%', bottom: -submenuBottomOffset, width: SUBMENU_WIDTH }}
          >
            <MenuItem label="Párrafo" onSelect={() => handleBlockType('paragraph')} />
            <MenuItem label="Título 1" onSelect={() => handleBlockType('1')} />
            <MenuItem label="Título 2" onSelect={() => handleBlockType('2')} />
            <MenuItem label="Título 3" onSelect={() => handleBlockType('3')} />
            <MenuItem label="Título 4" onSelect={() => handleBlockType('4')} />
            <MenuItem label="Título 5" onSelect={() => handleBlockType('5')} />
            <MenuItem label="Título 6" onSelect={() => handleBlockType('6')} />
          </div>
        )}
      </div>
      <MenuItem icon={Eraser} label="Limpiar formato" shortcut={`${mod}+\\`} onSelect={handleClearFormatting} />
    </div>,
    document.body,
  )
}
