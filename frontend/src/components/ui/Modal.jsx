import React, { useEffect, useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import cn from './cn.js';
import styles from './Modal.module.css';

// Module-level body-scroll refcount supports stacked modals: only the first
// open modal locks the body, only the last close releases it.
let openModalCount = 0;
let savedBodyOverflow = '';

function lockBodyScroll() {
  if (typeof document === 'undefined') return;
  if (openModalCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  openModalCount += 1;
}

function unlockBodyScroll() {
  if (typeof document === 'undefined') return;
  openModalCount = Math.max(0, openModalCount - 1);
  if (openModalCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
    savedBodyOverflow = '';
  }
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

function getFocusable(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (el) => el.offsetParent !== null || el === container
  );
}

export default function Modal({
  open,
  onClose,
  title,
  ariaLabel,
  size = 'md',
  closeOnEscape = true,
  closeOnBackdrop = true,
  showCloseButton = true,
  initialFocusRef,
  footer,
  ariaDescribedBy,
  className,
  overlayClassName,
  children,
}) {
  const titleId = useId();
  const cardRef = useRef(null);
  const previousActiveRef = useRef(null);
  const downOnOverlayRef = useRef(false);
  const warnedNoLabelRef = useRef(false);

  // Dev-only warning: a dialog with neither title nor aria-label has no
  // accessible name. Mirrors the icon-only Button warning pattern.
  if (
    open &&
    !title &&
    !ariaLabel &&
    !warnedNoLabelRef.current &&
    typeof console !== 'undefined' &&
    console.warn
  ) {
    console.warn(
      '[Modal] Provide `title` or `ariaLabel` so the dialog has an accessible name'
    );
    warnedNoLabelRef.current = true;
  }

  // Body-scroll lock with refcount
  useEffect(() => {
    if (!open) return undefined;
    lockBodyScroll();
    return () => {
      unlockBodyScroll();
    };
  }, [open]);

  // Effect 1: save & restore previously active element ONLY on open toggle.
  // Decoupled from initialFocusRef so a parent re-render with a new ref
  // identity does not corrupt previousActiveRef mid-modal.
  useLayoutEffect(() => {
    if (!open) return undefined;
    previousActiveRef.current =
      typeof document !== 'undefined' ? document.activeElement : null;
    return () => {
      const prev = previousActiveRef.current;
      if (prev && typeof prev.focus === 'function') {
        prev.focus();
      }
    };
  }, [open]);

  // Effect 2: initial focus inside the modal. Re-runs if initialFocusRef
  // identity changes; cleanup only cancels the deferred frame, never
  // touches previousActiveRef.
  useLayoutEffect(() => {
    if (!open) return undefined;

    // Defer focus to next frame so the portal/card has rendered
    const raf =
      typeof window !== 'undefined' && window.requestAnimationFrame
        ? window.requestAnimationFrame(focusInitial)
        : setTimeout(focusInitial, 0);

    function focusInitial() {
      if (initialFocusRef && initialFocusRef.current) {
        initialFocusRef.current.focus?.();
        return;
      }
      const focusables = getFocusable(cardRef.current);
      if (focusables.length > 0) {
        focusables[0].focus?.();
      } else if (cardRef.current) {
        cardRef.current.focus?.();
      }
    }

    return () => {
      if (typeof window !== 'undefined' && window.cancelAnimationFrame && typeof raf === 'number') {
        window.cancelAnimationFrame(raf);
      } else if (typeof clearTimeout === 'function') {
        clearTimeout(raf);
      }
    };
  }, [open, initialFocusRef]);

  // Escape + focus trap
  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === 'Escape' && closeOnEscape) {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = getFocusable(cardRef.current);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus?.();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus?.();
        }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  function handleOverlayMouseDown(e) {
    downOnOverlayRef.current = e.target === e.currentTarget;
  }

  function handleOverlayMouseUp(e) {
    const armed = downOnOverlayRef.current;
    downOnOverlayRef.current = false;
    if (closeOnBackdrop && armed && e.target === e.currentTarget) {
      onClose?.();
    }
  }

  return createPortal(
    <div
      className={cn(styles.overlay, overlayClassName)}
      onMouseDown={handleOverlayMouseDown}
      onMouseUp={handleOverlayMouseUp}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? ariaLabel : undefined}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className={cn(styles.card, styles[`size_${size}`], className)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <header className={styles.header}>
            {title && (
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            )}
            {showCloseButton && (
              <button
                type="button"
                aria-label="Cerrar"
                className={styles.closeButton}
                onClick={onClose}
              >
                <X size={20} aria-hidden="true" />
              </button>
            )}
          </header>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
