import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'
import cn from './cn.js'
import styles from './KebabMenu.module.css'

/**
 * KebabMenu — shared dropdown of actions triggered by a vertical "kebab" icon button.
 *
 * Trigger: ghost icon button (size sm = 32px) with MoreVertical icon (14 px).
 * Dropdown: opens on click, aligned to the right of the trigger; closes on
 * click-outside, ESC, or after invoking an item action.
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
    className,
    menuClassName,
    onOpenChange,
    disabled = false,
    ...rest
  },
  ref
) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
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

  // Click-outside + ESC
  useEffect(() => {
    if (!open) return undefined

    function onDocMouseDown(event) {
      const root = containerRef.current
      if (!root) return
      if (root.contains(event.target)) return
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

  return (
    <div
      ref={containerRef}
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

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(styles.menu, styles[`align_${align}`], menuClassName)}
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
        </div>
      )}
    </div>
  )
})

export default KebabMenu
