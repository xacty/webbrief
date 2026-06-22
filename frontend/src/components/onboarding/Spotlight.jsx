import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './Spotlight.module.css'

const CUTOUT_PADDING = 8
const TOOLTIP_GAP = 12
const TOOLTIP_WIDTH = 320
const TOOLTIP_HEIGHT_HINT = 220
const VIEWPORT_MARGIN = 12

/**
 * Spotlight — guided-tour overlay primitive.
 *
 * Renders a darkened backdrop with a transparent cutout around a
 * target element, plus a tooltip with title/body/buttons anchored
 * next to it. The cutout uses an even-odd clip-path polygon so
 * clicks inside the cutout pass through to the real target.
 *
 * Props:
 *  - target          string | Element | { current: Element } | null
 *                    CSS selector, DOM element, or React ref. When null
 *                    the tooltip centers on the viewport (modal-style).
 *  - title           string — bold header text
 *  - body            string | ReactNode — explanation copy
 *  - placement       'top' | 'bottom' | 'left' | 'right' (preferred,
 *                    auto-flipped if insufficient space)
 *  - stepIndex       0-based current step (for the "Paso X de N" pill)
 *  - totalSteps      total step count (set both to show the counter)
 *  - onNext          () => void — Next button handler
 *  - onPrev          () => void | null — Prev button (hidden when null
 *                    or stepIndex === 0)
 *  - onSkip          () => void — Skip button + Esc keyboard
 *  - isLast          boolean — render "Listo" instead of "Siguiente"
 *  - nextLabel       string — override Next label
 *  - prevLabel       string — override Prev label
 *  - skipLabel       string — override Skip label
 */
export default function Spotlight({
  target = null,
  title,
  body,
  placement: preferredPlacement,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  isLast = false,
  nextLabel,
  prevLabel,
  skipLabel = 'Saltar',
}) {
  const [rect, setRect] = useState(() => resolveRect(target))

  // Track target rect on raf so layout changes/scroll keep the halo
  // glued to its element. Single rAF loop, cancelled on unmount or
  // target change.
  useLayoutEffect(() => {
    let raf = 0
    let cancelled = false

    function tick() {
      if (cancelled) return
      const next = resolveRect(target)
      setRect((prev) => (rectsEqual(prev, next) ? prev : next))
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => {
      cancelled = true
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [target])

  // Scroll target into view once
  useEffect(() => {
    const el = resolveElement(target)
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    }
  }, [target])

  // Keyboard: Esc skips, → Next, ← Prev
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onSkip?.()
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation()
        onNext?.()
      } else if (e.key === 'ArrowLeft' && onPrev) {
        e.stopPropagation()
        onPrev?.()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onNext, onPrev, onSkip])

  const placement = useMemo(
    () => pickPlacement(rect, preferredPlacement),
    [rect, preferredPlacement],
  )

  const tooltipPos = useMemo(
    () => computeTooltipPosition(rect, placement),
    [rect, placement],
  )

  // Clip the backdrop with an axis-aligned polygon that "notches"
  // into the cutout via a zero-width bridge along x=x1.
  //
  // The naive 8-vertex outer+inner shape produces visible diagonal
  // artifacts when the cutout is near a viewport corner (the closing
  // edge from the last inner vertex back to the polygon start runs
  // diagonally across the viewport, and evenodd parity flips entire
  // triangular regions to "outside").
  //
  // This path starts at (x1, 0), traces the outer viewport counter-
  // clockwise back to (x1, 0), then descends into the cutout via
  // x=x1, walks the inner rect, and the implicit closing edge runs
  // straight back up along x=x1. All edges are axis-aligned, so
  // there are no diagonal artifacts regardless of cutout position.
  const safeClipPath = useMemo(() => {
    if (!rect) return undefined
    const x1 = Math.max(0, rect.left - CUTOUT_PADDING)
    const y1 = Math.max(0, rect.top - CUTOUT_PADDING)
    const x2 = Math.min(window.innerWidth, rect.right + CUTOUT_PADDING)
    const y2 = Math.min(window.innerHeight, rect.bottom + CUTOUT_PADDING)
    return `polygon(evenodd,
      ${x1}px 0, 0 0, 0 100vh, 100vw 100vh, 100vw 0, ${x1}px 0,
      ${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px
    )`
  }, [rect])

  if (typeof document === 'undefined') return null

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-labelledby="wb-spotlight-title">
      <div
        className={styles.backdrop}
        style={safeClipPath ? { clipPath: safeClipPath } : undefined}
        aria-hidden="true"
      />
      {rect && (
        <div
          className={styles.halo}
          style={{
            top: rect.top - CUTOUT_PADDING,
            left: rect.left - CUTOUT_PADDING,
            width: rect.width + 2 * CUTOUT_PADDING,
            height: rect.height + 2 * CUTOUT_PADDING,
          }}
          aria-hidden="true"
        />
      )}
      <div
        className={styles.tooltip}
        style={{ top: tooltipPos.top, left: tooltipPos.left }}
      >
        {Number.isFinite(stepIndex) && Number.isFinite(totalSteps) && totalSteps > 1 && (
          <span className={styles.stepCounter}>
            Paso {stepIndex + 1} de {totalSteps}
          </span>
        )}
        <h3 id="wb-spotlight-title" className={styles.title}>{title}</h3>
        {body && <p className={styles.body}>{body}</p>}
        <div className={styles.actions}>
          {onSkip && (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost}`}
              onClick={onSkip}
            >
              {skipLabel}
            </button>
          )}
          <div className={styles.navBtns}>
            {onPrev && stepIndex > 0 && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary}`}
                onClick={onPrev}
              >
                {prevLabel || 'Anterior'}
              </button>
            )}
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={onNext}
            >
              {nextLabel || (isLast ? 'Listo' : 'Siguiente')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function resolveElement(target) {
  if (!target) return null
  if (typeof target === 'string') return document.querySelector(target)
  if (target instanceof Element) return target
  if (target && target.current instanceof Element) return target.current
  return null
}

function resolveRect(target) {
  const el = resolveElement(target)
  if (!el) return null
  const r = el.getBoundingClientRect()
  // Hidden or zero-size elements: treat as null so the spotlight
  // falls back to viewport-center (modal-style).
  if (r.width === 0 && r.height === 0) return null
  return r
}

function rectsEqual(a, b) {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.top === b.top &&
    a.left === b.left &&
    a.width === b.width &&
    a.height === b.height
  )
}

function pickPlacement(rect, preferred) {
  if (!rect) return preferred || 'bottom'
  const winH = window.innerHeight
  const winW = window.innerWidth
  const spaceTop = rect.top
  const spaceBottom = winH - rect.bottom
  const spaceLeft = rect.left
  const spaceRight = winW - rect.right
  const needVert = TOOLTIP_HEIGHT_HINT + TOOLTIP_GAP + VIEWPORT_MARGIN
  const needHoriz = TOOLTIP_WIDTH + TOOLTIP_GAP + VIEWPORT_MARGIN

  if (preferred === 'top' && spaceTop >= needVert) return 'top'
  if (preferred === 'bottom' && spaceBottom >= needVert) return 'bottom'
  if (preferred === 'left' && spaceLeft >= needHoriz) return 'left'
  if (preferred === 'right' && spaceRight >= needHoriz) return 'right'

  if (spaceBottom >= needVert) return 'bottom'
  if (spaceTop >= needVert) return 'top'
  if (spaceRight >= needHoriz) return 'right'
  if (spaceLeft >= needHoriz) return 'left'
  return 'bottom'
}

function computeTooltipPosition(rect, placement) {
  const winH = typeof window !== 'undefined' ? window.innerHeight : 800
  const winW = typeof window !== 'undefined' ? window.innerWidth : 1280

  if (!rect) {
    return {
      top: Math.max(VIEWPORT_MARGIN, winH / 2 - TOOLTIP_HEIGHT_HINT / 2),
      left: Math.max(VIEWPORT_MARGIN, winW / 2 - TOOLTIP_WIDTH / 2),
    }
  }

  const r = rect
  switch (placement) {
    case 'top': {
      const top = Math.max(
        VIEWPORT_MARGIN,
        r.top - CUTOUT_PADDING - TOOLTIP_GAP - TOOLTIP_HEIGHT_HINT,
      )
      const left = clamp(
        r.left + r.width / 2 - TOOLTIP_WIDTH / 2,
        VIEWPORT_MARGIN,
        winW - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
      )
      return { top, left }
    }
    case 'left': {
      const left = Math.max(
        VIEWPORT_MARGIN,
        r.left - CUTOUT_PADDING - TOOLTIP_GAP - TOOLTIP_WIDTH,
      )
      const top = clamp(
        r.top + r.height / 2 - TOOLTIP_HEIGHT_HINT / 2,
        VIEWPORT_MARGIN,
        winH - TOOLTIP_HEIGHT_HINT - VIEWPORT_MARGIN,
      )
      return { top, left }
    }
    case 'right': {
      const left = clamp(
        r.right + CUTOUT_PADDING + TOOLTIP_GAP,
        VIEWPORT_MARGIN,
        winW - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
      )
      const top = clamp(
        r.top + r.height / 2 - TOOLTIP_HEIGHT_HINT / 2,
        VIEWPORT_MARGIN,
        winH - TOOLTIP_HEIGHT_HINT - VIEWPORT_MARGIN,
      )
      return { top, left }
    }
    case 'bottom':
    default: {
      const top = clamp(
        r.bottom + CUTOUT_PADDING + TOOLTIP_GAP,
        VIEWPORT_MARGIN,
        winH - TOOLTIP_HEIGHT_HINT - VIEWPORT_MARGIN,
      )
      const left = clamp(
        r.left + r.width / 2 - TOOLTIP_WIDTH / 2,
        VIEWPORT_MARGIN,
        winW - TOOLTIP_WIDTH - VIEWPORT_MARGIN,
      )
      return { top, left }
    }
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}
