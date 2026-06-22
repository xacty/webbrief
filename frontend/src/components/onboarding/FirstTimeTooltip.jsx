import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './FirstTimeTooltip.module.css';

const AUTO_CLOSE_MS = 6000;

/**
 * FirstTimeTooltip — fixed-positioned tooltip rendered via portal,
 * anchored to a target element by viewport rect. Auto-closes in 6s
 * or via the "Entendido" button. Position recomputes on scroll/resize
 * while visible.
 *
 * Props:
 * - title: string
 * - body: string
 * - targetRect: DOMRect | { top, bottom, left, right, width, height }
 * - placement: 'bottom' | 'top' (default 'bottom') — where tooltip sits
 *              relative to the anchor
 * - onClose: () => void — called on auto-close + click
 */
export default function FirstTimeTooltip({
  title,
  body,
  targetRect,
  placement = 'bottom',
  onClose,
}) {
  const [position, setPosition] = useState(null);

  useEffect(() => {
    if (!targetRect) {
      setPosition(null);
      return;
    }
    const TOOLTIP_WIDTH = 240;
    const TOOLTIP_HEIGHT = 110; // approximate
    const GAP = 8;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;

    let top;
    let arrowSide;
    if (placement === 'top') {
      top = Math.max(8, targetRect.top - TOOLTIP_HEIGHT - GAP);
      arrowSide = 'bottom';
    } else {
      // default 'bottom'; flip up if not enough room
      if (targetRect.bottom + TOOLTIP_HEIGHT + GAP > vh) {
        top = Math.max(8, targetRect.top - TOOLTIP_HEIGHT - GAP);
        arrowSide = 'bottom';
      } else {
        top = targetRect.bottom + GAP;
        arrowSide = 'top';
      }
    }

    // Horizontal: align left edge with anchor; clamp to viewport
    let left = targetRect.left;
    if (left + TOOLTIP_WIDTH > vw - 8) {
      left = Math.max(8, vw - TOOLTIP_WIDTH - 8);
    }
    if (left < 8) left = 8;

    setPosition({ top, left, arrowSide });
  }, [targetRect, placement]);

  useEffect(() => {
    if (!onClose) return undefined;
    const id = window.setTimeout(onClose, AUTO_CLOSE_MS);
    return () => window.clearTimeout(id);
  }, [onClose]);

  if (!position || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-label={title}
      className={styles.tooltip}
      style={{ top: position.top, left: position.left }}
    >
      <span
        aria-hidden="true"
        className={position.arrowSide === 'top' ? styles.arrowTop : styles.arrowBottom}
      />
      <h4 className={styles.title}>{title}</h4>
      <p className={styles.body}>{body}</p>
      <div className={styles.actions}>
        <button type="button" className={styles.acknowledge} onClick={onClose}>
          Entendido
        </button>
      </div>
    </div>,
    document.body
  );
}
