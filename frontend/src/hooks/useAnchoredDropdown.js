import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * useAnchoredDropdown — plomería compartida para dropdowns "portal a body".
 *
 * Extraído de tres implementaciones casi idénticas (`components/ui/KebabMenu.jsx`,
 * `components/editor/PageIndexMenu.jsx` y el menú inline de `PagePill` en
 * `pages/ProjectEditor.jsx`): posición fixed calculada desde el trigger con
 * `getBoundingClientRect`, recomputada en scroll (capture, cualquier ancestro)
 * + resize mientras el menú está abierto, cierre por click-outside (mousedown)
 * y por ESC con devolución de foco al trigger.
 *
 * Soporta dos modos de estado:
 *   - No controlado (default): el hook maneja su propio `open` interno.
 *   - Controlado: pasa `open` + `onOpenChange` — útil cuando el estado vive
 *     afuera (p. ej. `openMenuId` global de single-open en `ProjectEditor`).
 *
 * Placements soportados (los 4 que usan los consumidores reales):
 *   `bottom-end` (default) | `bottom-start` | `top-end` | `top-start`.
 * Vertical: `bottom-*` ancla con `top` (menú crece hacia abajo);
 * `top-*` ancla con `bottom` (menú crece hacia arriba sin saltar al medir).
 * Horizontal: `*-end` alinea el borde derecho; `*-start` alinea el izquierdo.
 */
export default function useAnchoredDropdown({
  placement = 'bottom-end',
  gap = 4,
  open: controlledOpen,
  onOpenChange,
} = {}) {
  const isControlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = isControlled ? controlledOpen : uncontrolledOpen

  const [position, setPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  const setOpen = useCallback((value) => {
    if (isControlled) {
      const next = typeof value === 'function' ? value(controlledOpen) : value
      onOpenChange?.(next)
    } else {
      setUncontrolledOpen(value)
    }
  }, [isControlled, controlledOpen, onOpenChange])

  const toggle = useCallback(() => {
    setOpen((current) => !current)
  }, [setOpen])

  // Cierra el menú y, salvo que se pida lo contrario, devuelve el foco al
  // trigger. Úsalo al ESC y al seleccionar un item (mejora sobre el legacy,
  // que solo devolvía foco en ESC).
  const close = useCallback(({ restoreFocus = true } = {}) => {
    setOpen(false)
    if (restoreFocus) triggerRef.current?.focus?.()
  }, [setOpen])

  const computePosition = useCallback(() => {
    const node = triggerRef.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0
    return {
      rect: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width },
      viewport: { width: vw, height: vh },
    }
  }, [])

  // Sync de posición al abrir, luego en scroll (cualquier ancestro, capture) + resize.
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

  // Click-outside (excluye trigger y menu) + ESC con devolución de foco.
  useEffect(() => {
    if (!open) return undefined

    function onDocMouseDown(event) {
      const trigger = triggerRef.current
      const menu = menuRef.current
      if (trigger && trigger.contains(event.target)) return
      if (menu && menu.contains(event.target)) return
      // Click-outside no devuelve foco: el foco ya se movió a donde el
      // usuario clickeó.
      setOpen(false)
    }

    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
      }
    }

    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, close, setOpen])

  let menuStyle = null
  if (position) {
    const { rect, viewport } = position
    const vertical = placement.startsWith('top')
      ? { bottom: viewport.height - rect.top + gap }
      : { top: rect.bottom + gap }
    const horizontal = placement.endsWith('end')
      ? { right: viewport.width - rect.right }
      : { left: rect.left }
    menuStyle = { ...vertical, ...horizontal }
  }

  return { open, setOpen, toggle, close, triggerRef, menuRef, menuStyle }
}
