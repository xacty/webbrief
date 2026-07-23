import { useId } from 'react'
import { createPortal } from 'react-dom'
import { List, Check } from 'lucide-react'
import useAnchoredDropdown from '../../hooks/useAnchoredDropdown.js'
import styles from './PageIndexMenu.module.css'

function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

/**
 * PageIndexMenu — dropdown con el índice completo de páginas del proyecto,
 * en su orden real (sin reordenamiento). Usa `useAnchoredDropdown` (mismo
 * patrón portal de `components/ui/KebabMenu.jsx`): createPortal a
 * document.body, posición fixed calculada desde el trigger con
 * getBoundingClientRect, recomputada en scroll/resize mientras está abierto,
 * cierre con click-outside + ESC.
 *
 * Elegir una página solo activa (onSelectPage) — no reordena el strip.
 * El auto-scroll del strip sobre `activePageId` (ya existente) hace el resto.
 */
export default function PageIndexMenu({ pages = [], activePageId, onSelectPage, peers = [] }) {
  const menuId = useId()

  const { open, setOpen, close, triggerRef, menuRef, menuStyle } = useAnchoredDropdown({
    placement: 'bottom-start',
    gap: 4, // ~var(--wb-space-1)
  })

  function handleTriggerClick(event) {
    event.preventDefault()
    event.stopPropagation()
    setOpen((current) => !current)
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
