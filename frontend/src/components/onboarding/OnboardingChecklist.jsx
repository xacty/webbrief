import React, { useState } from 'react';
import {
  Target,
  X,
  Circle,
  CheckCircle2,
  Building2,
  UserPlus,
  FilePlus2,
  Edit3,
  Share2,
  MessageCircle,
} from 'lucide-react';
import styles from './OnboardingChecklist.module.css';

const TASK_LABELS = {
  create_company: { label: 'Crear tu primera empresa', Icon: Building2 },
  invite_member: { label: 'Invitar a un miembro del equipo', Icon: UserPlus },
  create_project: { label: 'Crear tu primer proyecto', Icon: FilePlus2 },
  edit_page: { label: 'Editar la primera página', Icon: Edit3 },
  create_share_link: { label: 'Compartir el primer link público', Icon: Share2 },
  leave_comment: { label: 'Dejar tu primer comentario', Icon: MessageCircle },
};

const TASK_ORDER = [
  'create_company',
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

function orderedTasks(state) {
  const pending = TASK_ORDER.filter((k) => !state.tasks[k]?.doneAt);
  const done = TASK_ORDER.filter((k) => state.tasks[k]?.doneAt);
  return [...pending, ...done];
}

function countCompleted(state) {
  return TASK_ORDER.reduce((n, k) => n + (state.tasks[k]?.doneAt ? 1 : 0), 0);
}

export default function OnboardingChecklist({
  state = MOCK_STATE,
  onTaskClick = () => {},
  onDismiss = () => {},
}) {
  const [expanded, setExpanded] = useState(false);
  const done = countCompleted(state);
  const total = TASK_ORDER.length;
  const ordered = orderedTasks(state);

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
                disabled={isDone}
                aria-label={`${meta.label}${isDone ? ' (completada)' : ''}`}
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
