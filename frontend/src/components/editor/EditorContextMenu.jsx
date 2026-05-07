import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Bold, Italic, Underline, Strikethrough,
  Scissors, Copy, ClipboardPaste, Trash2,
  MessageSquare, Link2, Eraser, Type, ChevronRight,
} from 'lucide-react'
import styles from './EditorContextMenu.module.css'

const MENU_WIDTH = 240
const SUBMENU_WIDTH = 200

function clampPos(x, y, w = MENU_WIDTH, h = 360) {
  const margin = 8
  const left = Math.max(margin, Math.min(x, window.innerWidth - w - margin))
  const top = Math.max(margin, Math.min(y, window.innerHeight - h - margin))
  return { left, top }
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

export default function EditorContextMenu({ open, position, editor, onClose, onAddComment, canComment = false }) {
  const menuRef = useRef(null)
  const [submenu, setSubmenu] = useState(null) // 'block' | null

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
    if (!open) setSubmenu(null)
  }, [open])

  const isMac = useMemo(() => /Mac|iPod|iPhone|iPad/.test(navigator.platform), [])
  const mod = isMac ? '⌘' : 'Ctrl'

  if (!open || !editor) return null
  const pos = clampPos(position.x, position.y)

  const selection = editor.state.selection
  const hasSelection = !selection.empty

  async function safeRun(fn) {
    try { await fn() } catch (err) { console.warn('[ctxmenu] action failed:', err.message) }
    onClose?.()
  }

  function handleCut() {
    safeRun(async () => {
      const { from, to } = editor.state.selection
      if (from === to) return
      const text = editor.state.doc.textBetween(from, to, ' ', ' ')
      const html = window.getSelection()?.toString() ? window.getSelection().toString() : text
      try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
        else document.execCommand('copy')
      } catch {/* ignore */}
      editor.chain().focus().deleteSelection().run()
    })
  }

  function handleCopy() {
    safeRun(async () => {
      const { from, to } = editor.state.selection
      if (from === to) return
      const text = editor.state.doc.textBetween(from, to, ' ', ' ')
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
        // Browser may block clipboard read; user can use Cmd+V keyboard shortcut as fallback.
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
    onClose?.()
    onAddComment?.()
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
      style={{ left: pos.left, top: pos.top }}
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
            style={{ left: '100%', top: 0, width: SUBMENU_WIDTH }}
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
