import React, { forwardRef, useEffect, useId, useImperativeHandle } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'
import cn from './cn.js'
import useAnchoredDropdown from '../../hooks/useAnchoredDropdown.js'
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
  const menuId = useId()

  const { open, setOpen, close, triggerRef, menuRef, menuStyle } = useAnchoredDropdown({
    placement: resolvedPlacement,
    gap: 4, // ~var(--wb-space-1)
  })

  useImperativeHandle(ref, () => ({
    close: () => setOpen(false),
    open: () => setOpen(true),
    toggle: () => setOpen((current) => !current),
    focus: () => triggerRef.current?.focus?.(),
  }), [setOpen, triggerRef])

  useEffect(() => {
    if (typeof onOpenChange === 'function') onOpenChange(open)
  }, [open, onOpenChange])

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
    // close() (en vez de setOpen(false)) devuelve el foco al trigger tras
    // seleccionar un item.
    close()
    if (typeof item?.onClick === 'function') item.onClick(event)
  }

  // Stop propagation at the trigger wrapper so parent click handlers
  // (e.g. card-as-button openProject) do not fire.
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
