import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import cn from './cn.js'
import styles from './KebabMenu.module.css'

/**
 * KebabMenu — shared dropdown of actions triggered by a vertical "kebab" icon button.
 *
 * Trigger: ghost icon button (size sm = 32px) with MoreVertical icon (14 px).
 * Dropdown: portal to document.body so it escapes any ancestor stacking context
 * (e.g. cards with `transform: translateY(-2px)` on hover that otherwise clip
 * the menu under adjacent siblings). Position is computed from the trigger's
 * `getBoundingClientRect()` and recomputed on `scroll` (capture) + `resize`
 * while the menu is open.
 *
 * Items API:
 *   { label, icon, onClick, destructive?, disabled? }
 *
 * Tokens-only (no hardcoded colors / radii / shadows). Accessibility:
 *   - trigger: aria-haspopup="menu", aria-expanded
 *   - dropdown: role="menu"
 *   - items: role="menuitem"
 */
const KebabMenu = forwardRef(function KebabMenu(
  {
    items = [],
    label = 'Más acciones',
    triggerSize = 'sm',
    align = 'end',
    placement,
    className,
    menuClassName,
    onOpenChange,
    disabled = false,
    ...rest
  },
  ref
) {
  // Resolve placement: explicit `placement` wins; otherwise derive from
  // legacy `align` prop (bottom-end | bottom-start) for backwards compat.
  const resolvedPlacement = placement
    || (align === 'start' ? 'bottom-start' : 'bottom-end')
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const menuId = useId()

  useImperativeHandle(ref, () => ({
    close: () => setOpen(false),
    open: () => setOpen(true),
    toggle: () => setOpen((current) => !current),
    focus: () => triggerRef.current?.focus?.(),
  }), [])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  useEffect(() => {
    if (typeof onOpenChange === 'function') onOpenChange(open)
  }, [open, onOpenChange])

  // Compute fixed-position coordinates for the portal-rendered dropdown
  // based on the trigger button's viewport rect. `placement` chooses one of
  // `bottom-end` (default), `bottom-start`, `top-start`, `top-end`.
  //
  // Vertical: `bottom-*` puts the menu under the trigger (`top: rect.bottom + 4`);
  // `top-*` puts the menu above the trigger (`bottom: viewport.height - rect.top + 4`),
  // using CSS `bottom` so the menu stays anchored as it grows upward.
  // Horizontal: `*-end` aligns right edges; `*-start` aligns left edges.
  const computePosition = useCallback(() => {
    const node = triggerRef.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0
    return {
      placement: resolvedPlacement,
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      },
      viewport: { width: vw, height: vh },
    }
  }, [resolvedPlacement])

  // Sync position when opening, then on scroll (any ancestor) + resize.
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
    // Capture-phase scroll catches scrolls in any ancestor scrollable.
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, computePosition])

  // Click-outside (excluding trigger and menu) + ESC.
  useEffect(() => {
    if (!open) return undefined

    function onDocMouseDown(event) {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (trigger && trigger.contains(event.target)) return
      if (menu && menu.contains(event.target)) return
      setOpen(false)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus?.()
      }
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function handleTriggerClick(event) {
    event.preventDefault()
    event.stopPropagation()
    if (disabled) return
    setOpen((current) => !current)
  }

  function handleItemClick(event, item) {
    event.preventDefault()
    event.stopPropagation()
    if (item?.disabled) return
    setOpen(false)
    if (typeof item?.onClick === 'function') item.onClick(event)
  }

  // Stop propagation at the trigger wrapper so parent click handlers
  // (e.g. card-as-button openProject) do not fire.
  // Resolve fixed-position style from the structured `position` payload.
  // Bottom placements anchor via `top`; top placements anchor via `bottom`
  // (so the menu grows upward without shifting after layout).
  let menuStyle = null
  if (position) {
    const { placement: p, rect, viewport } = position
    const gap = 4 // ~var(--wb-space-1)
    const vertical = p.startsWith('top')
      ? { bottom: viewport.height - rect.top + gap }
      : { top: rect.bottom + gap }
    const horizontal = p.endsWith('end')
      ? { right: viewport.width - rect.right }
      : { left: rect.left }
    menuStyle = { ...vertical, ...horizontal }
  }

  return (
    <div
      className={cn(styles.root, className)}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        className={cn(styles.trigger, styles[`trigger_${triggerSize}`])}
        onClick={handleTriggerClick}
        {...rest}
      >
        <MoreVertical size={14} aria-hidden="true" />
      </button>

      {open && menuStyle && typeof document !== 'undefined' && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(styles.menu, menuClassName)}
          style={menuStyle}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {items.map((item, index) => {
            if (!item) return null
            const key = item.key ?? `${item.label || 'item'}-${index}`
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                disabled={Boolean(item.disabled)}
                className={cn(
                  styles.item,
                  item.destructive && styles.item_destructive,
                  item.disabled && styles.item_disabled
                )}
                onClick={(event) => handleItemClick(event, item)}
              >
                {item.icon && (
                  <span className={styles.itemIcon} aria-hidden="true">
                    {item.icon}
                  </span>
                )}
                <span className={styles.itemLabel}>{item.label}</span>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
})

export default KebabMenu
