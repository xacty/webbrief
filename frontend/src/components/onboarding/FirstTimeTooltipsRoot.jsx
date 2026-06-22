import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import FirstTimeTooltip from './FirstTimeTooltip';
import { getTutorialState, markFirstTimeSeen, isOnboardingActive } from '../../lib/tutorialState';

const TOOLTIP_CONTENT = {
  'editor-sections': {
    title: 'Panel de secciones',
    body: 'Cada bloque dividido por línea horizontal es una sección. Doble click en el título para renombrar.',
  },
  'notifications-bell': {
    title: 'Notificaciones',
    body: 'Aquí ves cuando algo cambia: proyecto creado, link compartido, propuesta aprobada.',
  },
  'editor-modes': {
    title: 'Modos del editor',
    body: 'Brief / Handoff / Preview. Cambia con la pill o con Cmd+1/2/3.',
  },
  'faq-add': {
    title: 'Agregar pregunta frecuente',
    body: 'Click aquí para crear una nueva pregunta. El modal admite texto largo.',
  },
};

/**
 * Single orchestrator mounted at the AppShell + editor level.
 * Scans the DOM for elements carrying `data-firsttime="<key>"`
 * (matching one of TOOLTIP_CONTENT keys) and renders a tooltip
 * anchored to the first match per key that hasn't been seen yet.
 *
 * Scans on:
 *   - mount (post first paint)
 *   - route change (location.pathname dependency)
 *   - DOM mutations (MutationObserver on document.body, debounced)
 *
 * One tooltip visible at a time; if multiple anchors are unseen the
 * orchestrator picks them in DOM order and shows the next one after
 * the current closes.
 */
export default function FirstTimeTooltipsRoot() {
  const location = useLocation();
  const [activeKey, setActiveKey] = useState(null);
  const [targetRect, setTargetRect] = useState(null);
  const [tick, setTick] = useState(0);

  // Scan trigger: re-run on route change + MutationObserver
  useEffect(() => {
    const state = getTutorialState();
    if (!isOnboardingActive(state)) return undefined;

    let debounceId = null;
    let observer = null;

    function pickNextAnchor() {
      const currentState = getTutorialState();
      if (!isOnboardingActive(currentState)) return null;
      const keys = Object.keys(TOOLTIP_CONTENT);
      for (const key of keys) {
        if (currentState.firstTimeTooltips[key]) continue;
        const el = document.querySelector(`[data-firsttime="${key}"]`);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return { key, rect };
          }
        }
      }
      return null;
    }

    function scan() {
      const next = pickNextAnchor();
      if (!next) {
        if (activeKey !== null) {
          setActiveKey(null);
          setTargetRect(null);
        }
        return;
      }
      // If already showing the same key, just update rect
      setActiveKey((prev) => {
        if (prev === next.key) {
          setTargetRect(next.rect);
          return prev;
        }
        setTargetRect(next.rect);
        return next.key;
      });
    }

    function debouncedScan() {
      if (debounceId) window.clearTimeout(debounceId);
      debounceId = window.setTimeout(scan, 120);
    }

    // First scan on next paint so the editor DOM has settled
    const initialId = window.requestAnimationFrame(scan);

    // MutationObserver for elements added later (e.g., editor tabs)
    observer = new MutationObserver(debouncedScan);
    observer.observe(document.body, { childList: true, subtree: true });

    // Resync rect on scroll + resize while a tooltip is showing
    function onScrollResize() {
      scan();
    }
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);

    return () => {
      window.cancelAnimationFrame(initialId);
      if (debounceId) window.clearTimeout(debounceId);
      if (observer) observer.disconnect();
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
    };
  }, [location.pathname, tick]);
  // ^ activeKey intentionally NOT in deps to avoid loops; we use setState
  // callback form above.

  function handleClose() {
    if (!activeKey) return;
    markFirstTimeSeen(activeKey);
    setActiveKey(null);
    setTargetRect(null);
    // Bump tick to retrigger the scan effect and pick the next anchor
    setTick((t) => t + 1);
  }

  if (!activeKey || !targetRect) return null;
  const content = TOOLTIP_CONTENT[activeKey];
  if (!content) return null;

  return (
    <FirstTimeTooltip
      title={content.title}
      body={content.body}
      targetRect={targetRect}
      placement="bottom"
      onClose={handleClose}
    />
  );
}
