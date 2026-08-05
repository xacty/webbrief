import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatBytes } from '../../lib/uploadQueue'
import styles from './Lightbox.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

// ImageKit-hosted assets get an on-the-fly transform for the full-size
// view; Supabase Storage assets (SVG passthrough) are served as-is —
// mirrors AssetGrid.assetThumbUrl, just at viewer width instead of the
// grid-thumb width.
function lightboxImageUrl(asset) {
  if (!asset?.public_url) return null
  if (asset.storage_bucket !== 'imagekit') return asset.public_url
  const separator = asset.public_url.includes('?') ? '&' : '?'
  return `${asset.public_url}${separator}tr=w-1600`
}

function getFocusable(container) {
  if (!container) return []
  return Array.from(container.querySelectorAll('button:not([disabled])')).filter(
    (el) => el.offsetParent !== null
  )
}

/**
 * Fullscreen image viewer — see DESIGN-SYSTEM.md §"Biblioteca de imágenes"
 * component inventory. Opened by double-click (or Enter with focus) on an
 * asset card in AssetGrid, including the trash view. Navigates across the
 * SAME `assets` array/`index` the calling grid is rendering, so the viewer
 * stays scoped to whatever's currently visible (a folder's contents or the
 * trash). No zoom in v1.
 *
 * Self-contained — does not reuse the `Modal` primitive (a fullscreen
 * scrim + centered image doesn't fit Modal's centered card shell), but
 * mirrors its accessibility conventions: portal to document.body,
 * body-scroll lock, mousedown/mouseup backdrop-click detection (so a
 * text-selection drag that ends outside the image doesn't accidentally
 * close it), ESC to close, and a small Tab focus trap across its own
 * (close/prev/next) buttons.
 */
export default function Lightbox({ assets = [], index = 0, onClose, onNavigate }) {
  const overlayRef = useRef(null)
  const closeButtonRef = useRef(null)
  const downOnOverlayRef = useRef(false)
  const previousActiveRef = useRef(null)
  const asset = assets[index] || null

  const goPrev = useCallback(() => {
    if (index > 0) onNavigate?.(index - 1)
  }, [index, onNavigate])

  const goNext = useCallback(() => {
    if (index < assets.length - 1) onNavigate?.(index + 1)
  }, [index, assets.length, onNavigate])

  // Focus the close button on mount, restore focus to whatever had it
  // before opening, and lock body scroll — same shape as Modal's effects,
  // kept local here since Lightbox never coexists with Modal (opened
  // straight from a grid card, not from within another dialog).
  useEffect(() => {
    previousActiveRef.current = typeof document !== 'undefined' ? document.activeElement : null
    closeButtonRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      const prev = previousActiveRef.current
      if (prev && typeof prev.focus === 'function') prev.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
        return
      }
      if (event.key === 'ArrowLeft') {
        goPrev()
        return
      }
      if (event.key === 'ArrowRight') {
        goNext()
        return
      }
      if (event.key === 'Tab') {
        const focusables = getFocusable(overlayRef.current)
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        const active = document.activeElement
        if (event.shiftKey && active === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && active === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [goPrev, goNext, onClose])

  if (!asset || typeof document === 'undefined') return null

  const src = lightboxImageUrl(asset)
  const weight = formatBytes(asset.file_size)

  function handleOverlayMouseDown(event) {
    downOnOverlayRef.current = event.target === event.currentTarget
  }

  function handleOverlayMouseUp(event) {
    const armed = downOnOverlayRef.current
    downOnOverlayRef.current = false
    if (armed && event.target === event.currentTarget) onClose?.()
  }

  return createPortal(
    <div
      ref={overlayRef}
      className={styles.overlay}
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
      role="dialog"
      aria-modal="true"
      aria-label={asset.file_name}
    >
      <button
        ref={closeButtonRef}
        type="button"
        className={styles.closeButton}
        aria-label="Cerrar"
        onClick={onClose}
      >
        <X size={22} aria-hidden="true" />
      </button>

      {index > 0 && (
        <button
          type="button"
          className={cx(styles.navButton, styles.navPrev)}
          aria-label="Imagen anterior"
          onClick={goPrev}
        >
          <ChevronLeft size={28} aria-hidden="true" />
        </button>
      )}

      {index < assets.length - 1 && (
        <button
          type="button"
          className={cx(styles.navButton, styles.navNext)}
          aria-label="Siguiente imagen"
          onClick={goNext}
        >
          <ChevronRight size={28} aria-hidden="true" />
        </button>
      )}

      {src && <img src={src} alt={asset.file_name} className={styles.image} />}

      <div className={styles.caption}>
        <span className={styles.captionName}>{asset.file_name}</span>
        {weight && <span className={styles.captionWeight}>{weight}</span>}
      </div>
    </div>,
    document.body
  )
}
