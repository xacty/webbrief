import React, { useEffect, useRef, useState } from 'react';
import {
  Target,
  X,
  Circle,
  CheckCircle2,
  Compass,
  UserPlus,
  FilePlus2,
  Edit3,
  Share2,
  MessageCircle,
  Sparkles,
} from 'lucide-react';
import styles from './OnboardingChecklist.module.css';

// Task copy + icons. Keys must match TASK_KEYS in tutorialState.js.
// The order here is also the display order — pending and completed
// tasks stay in their natural slot (top-to-bottom step 1 → step N),
// regardless of completion. Users read top-to-bottom.
const TASK_LABELS = {
  discover_workspace: { label: 'Conoce tu workspace', Icon: Compass },
  invite_member: { label: 'Invita a un miembro del equipo', Icon: UserPlus },
  create_project: { label: 'Crea tu primer proyecto', Icon: FilePlus2 },
  edit_page: { label: 'Edita una página', Icon: Edit3 },
  create_share_link: { label: 'Comparte un link público', Icon: Share2 },
  leave_comment: { label: 'Deja un comentario', Icon: MessageCircle },
};

const TASK_ORDER = [
  'discover_workspace',
  'invite_member',
  'create_project',
  'edit_page',
  'create_share_link',
  'leave_comment',
];

// Mock state for Task 4. Replaced by real state via props in Task 5.
const MOCK_STATE = {
  tasks: {
    create_company: { doneAt: '2026-06-08T10:00:00Z' },
    invite_member: { doneAt: null },
    create_project: { doneAt: '2026-06-08T11:00:00Z' },
    edit_page: { doneAt: null },
    create_share_link: { doneAt: null },
    leave_comment: { doneAt: null },
  },
};

// Preserve TASK_ORDER regardless of completion state — Spanish reads
// top-to-bottom, so step 1 must stay on top even after it's done.
function orderedTasks() {
  return TASK_ORDER;
}

function countCompleted(state) {
  return TASK_ORDER.reduce((n, k) => n + (state.tasks[k]?.doneAt ? 1 : 0), 0);
}

export default function OnboardingChecklist({
  state = MOCK_STATE,
  onTaskClick = () => {},
  onDismiss = () => {},
}) {
  // Initial expand: auto-open if the user has welcomed but hasn't completed
  // the tutorial yet. The hint that the user just clicked "Empezar tour" is
  // a fresh welcomedAt — the auto-complete poll won't satisfy this on its
  // own, but the AppShell state-change event listener now pushes the
  // updated state immediately so we can react.
  const [expanded, setExpanded] = useState(() => Boolean(state.welcomedAt && !state.completedAt));
  // Track the welcomedAt value we last reacted to so we don't re-open the
  // card every render after the user has explicitly minimized it.
  const lastSeenWelcomeRef = useRef(state.welcomedAt);

  useEffect(() => {
    if (state.welcomedAt && state.welcomedAt !== lastSeenWelcomeRef.current) {
      setExpanded(true);
      lastSeenWelcomeRef.current = state.welcomedAt;
    }
  }, [state.welcomedAt]);

  const done = countCompleted(state);
  const total = TASK_ORDER.length;
  const ordered = orderedTasks();
  const allDone = done === total;

  if (allDone && expanded) {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <div className={styles.celebration}>
            <span className={styles.celebrationIcon} aria-hidden="true">
              <Sparkles size={28} />
            </span>
            <h3 className={styles.celebrationTitle}>¡Listo, dominas WeBrief!</h3>
            <p className={styles.celebrationBody}>
              Has completado el tutorial. Cierra esta tarjeta cuando quieras.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className={styles.wrap}>
        <button
          type="button"
          className={styles.pill}
          onClick={() => setExpanded(true)}
          aria-label={`Empezando con WeBrief, ${done} de ${total} tareas completadas`}
        >
          <span className={styles.pillIcon} aria-hidden="true">
            <Target size={16} />
          </span>
          <span>Empezando</span>
          <span className={styles.pillCount}>
            · {done} de {total}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card} role="region" aria-label="Tutorial de WeBrief">
        <header className={styles.cardHeader}>
          <h3 className={styles.cardTitle}>
            <Target size={16} aria-hidden="true" />
            Empezando con WeBrief
          </h3>
          <button
            type="button"
            className={styles.cardClose}
            onClick={() => setExpanded(false)}
            aria-label="Minimizar tutorial"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className={styles.progress}>
          <div
            className={styles.progressBar}
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={total}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          <p className={styles.progressLabel}>
            {done} de {total} completos
          </p>
        </div>

        <div className={styles.tasks}>
          {ordered.map((key) => {
            const meta = TASK_LABELS[key];
            const isDone = !!state.tasks[key]?.doneAt;
            return (
              <button
                key={key}
                type="button"
                className={`${styles.task} ${isDone ? styles.taskDone : ''}`}
                onClick={() => onTaskClick(key)}
                aria-label={`${meta.label}${isDone ? ' (completada — pulsa para repetir el tour)' : ''}`}
              >
                <span
                  className={`${styles.taskIcon} ${
                    isDone ? styles.taskIconDone : styles.taskIconPending
                  }`}
                  aria-hidden="true"
                >
                  {isDone ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                </span>
                <span className={styles.taskLabel}>{meta.label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.dismissLink} onClick={onDismiss}>
            Descartar tutorial
          </button>
        </div>
      </div>
    </div>
  );
}
