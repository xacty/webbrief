import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle, X, ArrowRight } from 'lucide-react';
import cn from './cn.js';
import styles from './HelpPopover.module.css';

/**
 * HelpPopover — small "?" icon next to a label that opens a popover
 * with contextual help text. Modeled after KebabMenu (portal + fixed
 * positioning + scroll/resize sync), simplified for plain text content.
 *
 * Props:
 * - title: string (popover header)
 * - body: string | ReactNode (popover body)
 * - learnMoreHref: string (optional anchor or URL)
 * - learnMoreLabel: string (defaults to "Aprende más")
 * - ariaLabel: string (defaults to "Ayuda: {title}")
 * - size: 'sm' (default — 14px icon) — reserved for future tiers
 * - className: passthrough class on the wrapping span
 */
export default function HelpPopover({
  title,
  body,
  learnMoreHref,
  learnMoreLabel = 'Aprende más',
  ariaLabel,
  size = 'sm',
  className,
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const popoverId = useId();

  const computePosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    // Prefer below the trigger; flip above if not enough room.
    const POPOVER_HEIGHT = 160; // conservative estimate, used only for the flip decision
    const POPOVER_WIDTH = 280;
    const gap = 6;
    const fitsBelow = rect.bottom + POPOVER_HEIGHT + gap < vh;
    const fitsRight = rect.left + POPOVER_WIDTH < vw;
    return {
      top: fitsBelow ? rect.bottom + gap : Math.max(8, rect.top - POPOVER_HEIGHT - gap),
      left: fitsRight ? rect.left : Math.max(8, vw - POPOVER_WIDTH - 8),
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return undefined;
    }
    function update() {
      const next = computePosition();
      if (next) setPosition(next);
    }
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, computePosition]);

  useEffect(() => {
    if (!open) return undefined;
    function onDocMouseDown(e) {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return;
      if (popoverRef.current && popoverRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus?.();
      }
    }
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function handleTriggerClick(e) {
    e.preventDefault();
    e.stopPropagation();
    setOpen((current) => !current);
  }

  const triggerLabel = ariaLabel || `Ayuda: ${title}`;

  return (
    <span className={cn(styles.root, className)} onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="dialog"
        aria-expanded={open ? 'true' : 'false'}
        aria-controls={open ? popoverId : undefined}
        className={styles.trigger}
        onClick={handleTriggerClick}
      >
        <HelpCircle size={14} aria-hidden="true" />
      </button>

      {open && position && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          id={popoverId}
          role="dialog"
          aria-label={title}
          className={styles.popover}
          style={position}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.popoverHeader}>
            <strong className={styles.title}>{title}</strong>
            <button
              type="button"
              aria-label="Cerrar ayuda"
              className={styles.close}
              onClick={() => setOpen(false)}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <p className={styles.body}>{body}</p>
          {learnMoreHref && (
            <a
              href={learnMoreHref}
              onClick={(e) => {
                if (learnMoreHref.startsWith('#')) e.preventDefault();
              }}
              className={styles.learnMore}
            >
              {learnMoreLabel}
              <ArrowRight size={12} aria-hidden="true" />
            </a>
          )}
        </div>,
        document.body
      )}
    </span>
  );
}
