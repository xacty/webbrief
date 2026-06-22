import React from 'react';
import { ArrowRight } from 'lucide-react';
import { Button } from '../ui';
import styles from './EmptyState.module.css';

/**
 * Generic empty-state primitive. Use in place of plain "no data" text
 * on listing pages. The icon prop should be a Lucide React component.
 *
 * Props:
 * - icon: Lucide component (required)
 * - title: string (required)
 * - body: string or ReactNode (optional)
 * - cta: { label, onClick, icon? } | null — primary action
 * - learnMore: { label, href } | null — secondary "learn more" link
 *
 * Render-alternative for role-locked actions: pass cta={null} when the
 * user can't perform the action and surface the body text instead
 * (e.g., "Pídele a tu manager que cree la primera empresa.").
 */
export default function EmptyState({ icon: Icon, title, body, cta, learnMore }) {
  return (
    <div className={styles.wrap}>
      {Icon && (
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon size={36} />
        </span>
      )}
      <h3 className={styles.title}>{title}</h3>
      {body && <p className={styles.body}>{body}</p>}
      {(cta || learnMore) && (
        <div className={styles.actions}>
          {cta && (
            <Button
              variant="primary"
              icon={cta.icon || null}
              onClick={cta.onClick}
            >
              {cta.label}
            </Button>
          )}
          {learnMore && (
            <a
              href={learnMore.href}
              onClick={(e) => {
                if (learnMore.href && learnMore.href.startsWith('#')) {
                  e.preventDefault();
                }
                learnMore.onClick?.(e);
              }}
              className={styles.learnMore}
            >
              {learnMore.label}
              <ArrowRight size={12} aria-hidden="true" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
