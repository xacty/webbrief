import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { List, Check } from 'lucide-react'
import styles from './PageIndexMenu.module.css'

function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

/**
 * PageIndexMenu — dropdown con el índice completo de páginas del proyecto,
 * en su orden real (sin reordenamiento). Sigue el patrón portal de
 * `components/ui/KebabMenu.jsx`: createPortal a document.body, posición
 * fixed calculada desde el trigger con getBoundingClientRect, recomputada
 * en scroll/resize mientras está abierto, cierre con click-outside + ESC.
 *
 * Elegir una página solo activa (onSelectPage) — no reordena el strip.
 * El auto-scroll del strip sobre `activePageId` (ya existente) hace el resto.
 */
export default function PageIndexMenu({ pages = [], activePageId, onSelectPage, peers = [] }) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()

  const close = useCallback(() => setOpen(false), [])

  const computePosition = useCallback(() => {
    const node = triggerRef.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0
    return {
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right },
      viewport: { width: vw, height: vh },
    }
  }, [])

  // Sync position al abrir, luego en scroll (cualquier ancestro) + resize.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return undefined
    }
    function update() {
      const next = computePosition()
      if (next) setPosition(next)
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, computePosition])

  // Click-outside (excluye trigger y menu) + ESC.
  useEffect(() => {
    if (!open) return undefined

    function onDocMouseDown(event) {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (trigger && trigger.contains(event.target)) return
      if (menu && menu.contains(event.target)) return
      close()
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        triggerRef.current?.focus?.()
      }
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close])

  function handleTriggerClick(event) {
    event.preventDefault()
    event.stopPropagation()
    setOpen((current) => !current)
  }

  // Placement bottom-start: ancla el borde izquierdo del menú al del
  // trigger, debajo de este.
  let menuStyle = null
  if (position) {
    const { rect } = position
    const gap = 4 // ~var(--wb-space-1)
    menuStyle = { top: rect.bottom + gap, left: rect.left }
  }

  return (
    <div className={styles.root} onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Índice de páginas"
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? menuId : undefined}
        className={styles.trigger}
        onClick={handleTriggerClick}
      >
        <List size={14} aria-hidden="true" />
        <span className={styles.triggerCount}>{pages.length}</span>
      </button>

      {open && menuStyle && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Índice de páginas"
          className={styles.menu}
          style={menuStyle}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {pages.map((page, index) => {
            const pagePeers = peers.filter((peer) => peer.pageId === page.id)
            return (
              <button
                key={page.id}
                type="button"
                role="menuitem"
                className={cn(styles.item, page.id === activePageId && styles.itemActive)}
                onClick={() => { onSelectPage(page.id); close() }}
              >
                <span className={styles.itemIndex}>{index + 1}</span>
                <span className={styles.itemName} title={page.name}>{page.name}</span>
                {page.id === activePageId && <Check size={14} className={styles.itemCheck} />}
                <span className={styles.itemSlot} data-presence-slot={page.id}>
                  {pagePeers.length > 0 && (
                    <span
                      className={styles.presenceDot}
                      title={`${pagePeers.map((peer) => peer.name || 'Alguien').join(', ')} está(n) aquí`}
                    />
                  )}
                </span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}
