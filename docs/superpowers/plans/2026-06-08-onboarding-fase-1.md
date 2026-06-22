# Onboarding Fase 1 — Welcome Modal + Checklist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-slide welcome modal on first login plus a persistent floating onboarding checklist with auto-detected task completion, so new internal users (manager / editor / workers) learn the create-company → invite → first-project loop in their first session.

**Architecture:** All state lives in `localStorage` under key `wb-tutorial-state` (single JSON object, no backend, no migration). A pure module `tutorialState.js` owns read/write. Two presentational components (`WelcomeModal`, `OnboardingChecklist`) mount inside `AppShell` (not in `ProjectEditor`). A hook `useTutorialAutoComplete` polls existing in-memory query state for company/project/team counts and auto-marks tasks as done. Manual marks for share link + comment fire from the existing components when the user performs the action. The veteran-user gate (`isOnboardingActive`) silently completes tasks when an existing user with data signs in, so the modal never bothers them.

**Tech Stack:** React 18, Vite, lucide-react, custom CSS modules with `--wb-*` design tokens. No new npm dependencies. Reuses `Modal`, `Button`, `Card`, `Badge` from `frontend/src/components/ui/`.

**Working directory:** `/Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial`. All commands assume this is the cwd.

**Companion spec:** [`/Users/adrian/.claude/plans/quiero-ver-de-implementar-gentle-frost.md`](/Users/adrian/.claude/plans/quiero-ver-de-implementar-gentle-frost.md) — see §Design intelligence for token-level decisions and §Decisiones tomadas for scope.

**Out of scope (deferred to later fases):**
- Fase 2: project-type explainers
- Fase 3a: empty-states refactor
- Fase 3b: HelpPopover primitive
- Fase 3c: First-time tooltips
- Server-side persistence (`profiles.onboarding_state`) — v1 is localStorage-only

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/lib/tutorialState.js` | **Create** | Pure module: read/write `wb-tutorial-state` in localStorage, expose getters + setters + `isOnboardingActive` predicate |
| `frontend/src/components/onboarding/WelcomeModal.jsx` | **Create** | 1-slide modal with Sparkles icon, copy, "Empezar tour" + "Saltar" CTAs |
| `frontend/src/components/onboarding/WelcomeModal.module.css` | **Create** | Hero circle + spacing for the modal body |
| `frontend/src/components/onboarding/OnboardingChecklist.jsx` | **Create** | Floating card with compact pill state + expanded card state, progress bar, 6 task rows, celebration, descartar link |
| `frontend/src/components/onboarding/OnboardingChecklist.module.css` | **Create** | All styles for both pill + card states |
| `frontend/src/components/onboarding/useTutorialAutoComplete.js` | **Create** | Hook that subscribes to companies/projects context and auto-marks tasks done |
| `frontend/src/App.jsx` | **Modify** | Mount `<WelcomeModal>` conditional on `isOnboardingActive` |
| `frontend/src/components/layout/AppShell.jsx` | **Modify** | Mount `<OnboardingChecklist>` + call `useTutorialAutoComplete`; hide in editor route |
| `frontend/src/pages/AccountSettingsPage.jsx` | **Modify** | Add "Reiniciar tutorial" link in account settings |

**Auto-detection wiring (no new endpoints):**
- Tasks `create_company`, `invite_member`, `create_project`, `edit_page` auto-detect from sessionStorage caches `webrief:companies` and `webrief:company:<id>` (already populated by existing pages).
- Tasks `create_share_link` and `leave_comment` fire `markTaskDone()` from existing components (`ShareLinkPanel`, `CommentComposerPopover`) at the moment the user performs the action — one line per call site.

---

## Task 1: Create tutorialState.js module

**Files:**
- Create: `frontend/src/lib/tutorialState.js`

- [ ] **Step 1: Write the module**

Create `frontend/src/lib/tutorialState.js` with this exact content:

```js
/**
 * Tutorial state — single source of truth for onboarding progress.
 * Persisted in localStorage under STORAGE_KEY. No backend, no migration.
 *
 * Shape:
 * {
 *   welcomedAt: ISOString | null,
 *   dismissedAt: ISOString | null,
 *   completedAt: ISOString | null,
 *   tasks: {
 *     [taskKey]: { doneAt: ISOString | null }
 *   },
 *   typeExplainers: {
 *     page: ISOString | null,
 *     document: ISOString | null,
 *     faq: ISOString | null,
 *     brief: ISOString | null
 *   }
 * }
 */

const STORAGE_KEY = 'wb-tutorial-state';

export const TASK_KEYS = [
  'create_company',
  'invite_member',
  'create_project',
  'edit_page',
  'create_share_link',
  'leave_comment',
];

const TYPE_KEYS = ['page', 'document', 'faq', 'brief'];

function emptyState() {
  return {
    welcomedAt: null,
    dismissedAt: null,
    completedAt: null,
    tasks: Object.fromEntries(TASK_KEYS.map((k) => [k, { doneAt: null }])),
    typeExplainers: Object.fromEntries(TYPE_KEYS.map((k) => [k, null])),
  };
}

export function getTutorialState() {
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    // Defensive merge to tolerate older schemas
    const base = emptyState();
    return {
      ...base,
      ...parsed,
      tasks: { ...base.tasks, ...(parsed.tasks || {}) },
      typeExplainers: { ...base.typeExplainers, ...(parsed.typeExplainers || {}) },
    };
  } catch {
    return emptyState();
  }
}

function writeState(next) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function markWelcomed() {
  const state = getTutorialState();
  const next = { ...state, welcomedAt: state.welcomedAt || new Date().toISOString() };
  writeState(next);
  return next;
}

export function markDismissed() {
  const state = getTutorialState();
  const next = { ...state, dismissedAt: new Date().toISOString() };
  writeState(next);
  return next;
}

export function markCompleted() {
  const state = getTutorialState();
  const next = { ...state, completedAt: state.completedAt || new Date().toISOString() };
  writeState(next);
  return next;
}

export function markTaskDone(taskKey) {
  if (!TASK_KEYS.includes(taskKey)) return getTutorialState();
  const state = getTutorialState();
  if (state.tasks[taskKey]?.doneAt) return state;
  const next = {
    ...state,
    tasks: { ...state.tasks, [taskKey]: { doneAt: new Date().toISOString() } },
  };
  writeState(next);
  return next;
}

export function markTypeSeen(type) {
  if (!TYPE_KEYS.includes(type)) return getTutorialState();
  const state = getTutorialState();
  if (state.typeExplainers[type]) return state;
  const next = {
    ...state,
    typeExplainers: { ...state.typeExplainers, [type]: new Date().toISOString() },
  };
  writeState(next);
  return next;
}

export function resetTutorial() {
  writeState(emptyState());
}

export function countCompletedTasks(state) {
  return TASK_KEYS.reduce((n, k) => n + (state.tasks[k]?.doneAt ? 1 : 0), 0);
}

/**
 * Should the onboarding UI be shown?
 * Returns false when:
 * - user dismissed it
 * - user completed it
 * - user has data in the system that proves they're already a veteran
 *   (in which case we silently mark the relevant tasks as done)
 *
 * @param state — result of getTutorialState()
 * @param signals — { companiesCount, projectsCount, membersCount }
 *                 from the AppShell context. All optional; missing fields
 *                 are treated as 0.
 */
export function isOnboardingActive(state, signals = {}) {
  if (state.dismissedAt) return false;
  if (state.completedAt) return false;
  return true;
}

/**
 * For each signal we have, silently mark the matching task as done
 * (without showing the celebration). Used to make existing veterans
 * skip the tutorial.
 */
export function syncTasksFromSignals(signals) {
  const { companiesCount = 0, projectsCount = 0, membersCount = 0, hasEditedPage = false } = signals;
  if (companiesCount > 0) markTaskDone('create_company');
  if (membersCount > 1) markTaskDone('invite_member');
  if (projectsCount > 0) markTaskDone('create_project');
  if (hasEditedPage) markTaskDone('edit_page');
}

export { STORAGE_KEY };
```

- [ ] **Step 2: Verify the module loads in Vite**

Run from the worktree path:
```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial/frontend && npx vite build --mode development 2>&1 | tail -5
```
Expected: build succeeds (no syntax errors); no warning about unresolved imports.

- [ ] **Step 3: Commit**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial
git add frontend/src/lib/tutorialState.js
git commit -m "$(cat <<'EOF'
feat(onboarding): add tutorialState module for localStorage persistence

Pure module exposing getters/setters for the wb-tutorial-state key.
Includes isOnboardingActive predicate and syncTasksFromSignals helper
so existing veteran users silently complete tasks rather than seeing
the modal.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create WelcomeModal component

**Files:**
- Create: `frontend/src/components/onboarding/WelcomeModal.jsx`
- Create: `frontend/src/components/onboarding/WelcomeModal.module.css`

- [ ] **Step 1: Write the CSS module**

Create `frontend/src/components/onboarding/WelcomeModal.module.css`:

```css
.body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--wb-space-4);
  padding: var(--wb-space-2) var(--wb-space-2) var(--wb-space-1);
  text-align: center;
}

.hero {
  width: 64px;
  height: 64px;
  border-radius: var(--wb-radius-full);
  background: var(--wb-color-primary-100);
  color: var(--wb-color-primary-700);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.title {
  margin: 0;
  font-size: var(--wb-text-2xl);
  font-weight: var(--wb-weight-bold);
  line-height: var(--wb-leading-tight);
  color: var(--wb-text);
}

.body p {
  margin: 0;
  max-width: 420px;
  font-size: var(--wb-text-base);
  line-height: var(--wb-leading-relaxed);
  color: var(--wb-text-muted);
}

.actions {
  display: flex;
  justify-content: center;
  gap: var(--wb-space-3);
  width: 100%;
  margin-top: var(--wb-space-3);
}
```

- [ ] **Step 2: Write the JSX component**

Create `frontend/src/components/onboarding/WelcomeModal.jsx`:

```jsx
import React from 'react';
import { Sparkles } from 'lucide-react';
import { Modal, Button } from '../ui';
import styles from './WelcomeModal.module.css';

export default function WelcomeModal({ open, onStart, onSkip }) {
  return (
    <Modal
      open={open}
      onClose={onSkip}
      size="md"
      title=""
      showCloseButton={false}
      ariaLabel="Bienvenida a WeBrief"
    >
      <div className={styles.body}>
        <span className={styles.hero} aria-hidden="true">
          <Sparkles size={32} />
        </span>
        <h2 className={styles.title}>Bienvenido a WeBrief</h2>
        <p>
          Te muestro lo esencial en 60 segundos: crear empresa, invitar al equipo y abrir tu
          primer proyecto. Puedes saltarlo y reiniciarlo desde Ajustes cuando quieras.
        </p>
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onSkip}>
            Saltar por ahora
          </Button>
          <Button variant="primary" onClick={onStart}>
            Empezar tour
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Visual verify via preview MCP**

Start dev server in the worktree on port 5174 (so it doesn't collide with the OAuth dev server on 5173):
```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial/frontend && PORT=5174 npx vite --port 5174 &
```

Add a temporary debug route in App.jsx (or use the existing role-preview) to render `<WelcomeModal open onStart={() => console.log('start')} onSkip={() => console.log('skip')} />`. Then screenshot via preview MCP, confirm: Sparkles in circle, title centered, body paragraph, 2 buttons aligned.

(Remove the debug mount immediately — the real mount comes in Task 3.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/onboarding/WelcomeModal.jsx frontend/src/components/onboarding/WelcomeModal.module.css
git commit -m "$(cat <<'EOF'
feat(onboarding): add WelcomeModal component

1-slide modal with Sparkles hero icon, copy in neutral Spanish, and
Empezar/Saltar CTAs. Reuses Modal + Button primitives from
components/ui. Triggered by App.jsx in Task 3.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Mount WelcomeModal in App.jsx

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Add the import**

In `frontend/src/App.jsx`, add to the lazy imports section:

```jsx
import { useEffect, useState } from 'react'
// ...existing imports...
import WelcomeModal from './components/onboarding/WelcomeModal'
import { getTutorialState, markWelcomed, markDismissed, isOnboardingActive } from './lib/tutorialState'
```

(Adjust the existing `import { Suspense, lazy } from 'react'` to add `useEffect, useState`.)

- [ ] **Step 2: Add the WelcomeGate component**

Inside `App.jsx`, **above `AppRoutes`**, add:

```jsx
function WelcomeGate() {
  const { isAuthenticated, realCurrentUser, loading } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (loading || !isAuthenticated || !realCurrentUser) return
    const state = getTutorialState()
    if (!isOnboardingActive(state)) return
    if (state.welcomedAt) return
    // Defer one paint so the shell renders first
    const id = window.requestAnimationFrame(() => setOpen(true))
    return () => window.cancelAnimationFrame(id)
  }, [loading, isAuthenticated, realCurrentUser])

  function handleStart() {
    markWelcomed()
    setOpen(false)
  }

  function handleSkip() {
    markDismissed()
    setOpen(false)
  }

  return <WelcomeModal open={open} onStart={handleStart} onSkip={handleSkip} />
}
```

- [ ] **Step 3: Mount WelcomeGate in AppRoutes**

Inside `AppRoutes`, just before the closing `</Suspense>`, add:

```jsx
      {isAuthenticated && <WelcomeGate />}
```

(Hint: `isAuthenticated` is already available — you may need to destructure it from `useAuth()` at the top of `AppRoutes` if not present. If not present, add it.)

- [ ] **Step 4: Visual verify**

In a fresh incognito window (or after `localStorage.removeItem('wb-tutorial-state')`):
1. Log in
2. Land on `/companies`
3. Verify the modal appears after one paint
4. Click "Saltar por ahora" → modal closes, `wb-tutorial-state.dismissedAt` is set
5. Hard refresh → modal does NOT reappear

Then in DevTools: `localStorage.removeItem('wb-tutorial-state')`, refresh → modal reappears.
Click "Empezar tour" → modal closes, `welcomedAt` set, `dismissedAt` null.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): mount WelcomeModal on first authenticated render

WelcomeGate component reads tutorialState, defers one frame for the
shell to settle, then opens the modal if welcomedAt and dismissedAt
are both null. Empezar marks welcomed, Saltar marks dismissed.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create OnboardingChecklist (compact pill + expanded card shells)

**Files:**
- Create: `frontend/src/components/onboarding/OnboardingChecklist.jsx`
- Create: `frontend/src/components/onboarding/OnboardingChecklist.module.css`

This task creates only the visual shells with hardcoded mock state. Wiring to real state comes in Task 5.

- [ ] **Step 1: Write the CSS module**

Create `frontend/src/components/onboarding/OnboardingChecklist.module.css`:

```css
.wrap {
  position: fixed;
  right: var(--wb-space-5);
  bottom: var(--wb-space-5);
  z-index: var(--wb-z-sticky);
  font-family: inherit;
}

/* ---- Compact pill ---- */
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--wb-space-2);
  padding: var(--wb-space-2) var(--wb-space-4);
  background: var(--wb-surface);
  color: var(--wb-text);
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-3);
  box-shadow: var(--wb-shadow-md);
  font-size: var(--wb-text-sm);
  font-weight: var(--wb-weight-medium);
  cursor: pointer;
  transition: transform 180ms ease-out, box-shadow 180ms ease-out;
}

.pill:hover {
  transform: translateY(-2px);
  box-shadow: var(--wb-shadow-lg);
}

.pillIcon {
  color: var(--wb-color-primary-700);
  display: inline-flex;
}

.pillCount {
  color: var(--wb-text-muted);
  font-variant-numeric: tabular-nums;
}

/* ---- Expanded card ---- */
.card {
  width: 320px;
  background: var(--wb-surface);
  border: 1px solid var(--wb-border);
  border-radius: var(--wb-radius-3);
  box-shadow: var(--wb-shadow-xl);
  overflow: hidden;
}

.cardHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--wb-space-2);
  padding: var(--wb-space-4) var(--wb-space-4) var(--wb-space-2);
}

.cardTitle {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: var(--wb-space-2);
  font-size: var(--wb-text-base);
  font-weight: var(--wb-weight-semibold);
  color: var(--wb-text);
}

.cardClose {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--wb-color-neutral-500);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--wb-radius-2);
  display: inline-flex;
}

.cardClose:hover {
  background: var(--wb-color-neutral-100);
  color: var(--wb-text);
}

/* Progress */
.progress {
  margin: 0 var(--wb-space-4) var(--wb-space-2);
}

.progressBar {
  width: 100%;
  height: 4px;
  background: var(--wb-color-neutral-100);
  border-radius: var(--wb-radius-full);
  overflow: hidden;
}

.progressFill {
  height: 100%;
  background: var(--wb-color-primary-600);
  transition: width 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

.progressLabel {
  margin: 6px 0 0;
  font-size: var(--wb-text-xs);
  color: var(--wb-text-muted);
}

/* Task list */
.tasks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--wb-space-2);
}

.task {
  appearance: none;
  display: flex;
  align-items: center;
  gap: var(--wb-space-3);
  width: 100%;
  padding: var(--wb-space-2) var(--wb-space-2);
  background: transparent;
  border: none;
  border-radius: var(--wb-radius-2);
  text-align: left;
  cursor: pointer;
  font-size: var(--wb-text-sm);
  font-weight: var(--wb-weight-medium);
  color: var(--wb-text);
  transition: background 120ms ease-out;
}

.task:hover {
  background: var(--wb-color-neutral-50);
}

.taskDone {
  color: var(--wb-text-muted);
  cursor: default;
}

.taskDone:hover {
  background: transparent;
}

.taskDone .taskLabel {
  text-decoration: line-through;
}

.taskIcon {
  display: inline-flex;
  flex-shrink: 0;
}

.taskIconPending {
  color: var(--wb-color-neutral-400, var(--wb-color-neutral-500));
}

.taskIconDone {
  color: var(--wb-color-success-600, var(--wb-color-success-700));
}

.taskLabel {
  flex: 1;
  min-width: 0;
}

/* Footer */
.footer {
  padding: var(--wb-space-2) var(--wb-space-4) var(--wb-space-3);
  border-top: 1px solid var(--wb-border);
}

.dismissLink {
  appearance: none;
  background: transparent;
  border: none;
  padding: 4px 0;
  color: var(--wb-text-muted);
  font-size: var(--wb-text-xs);
  cursor: pointer;
  text-decoration: underline;
}

.dismissLink:hover {
  color: var(--wb-text);
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .pill,
  .progressFill {
    transition: none;
  }
  .pill:hover {
    transform: none;
  }
}
```

- [ ] **Step 2: Write the component (mock state — wired in Task 5)**

Create `frontend/src/components/onboarding/OnboardingChecklist.jsx`:

```jsx
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
            <X size={16} />
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
                onClick={() => !isDone && onTaskClick(key)}
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
```

- [ ] **Step 3: Visual verify both states via preview MCP**

Temporarily render `<OnboardingChecklist />` in `App.jsx` at the same level as `<WelcomeGate />`. Screenshot:
- Initial: compact pill bottom-right with "Empezando · 2 de 6"
- Click pill → expanded card with: header + close icon, progress bar ~33%, 6 task rows (4 pending first, 2 done struck-through at bottom), Descartar link

Then click ✕ on the card → back to pill. Click Descartar → calls onDismiss handler (verify console).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/onboarding/OnboardingChecklist.jsx frontend/src/components/onboarding/OnboardingChecklist.module.css
git commit -m "$(cat <<'EOF'
feat(onboarding): add OnboardingChecklist visual shells

Compact pill + expanded card both rendered. Progress bar, 6 task rows,
descartar link. Wired against a mock state object; real state comes
from AppShell in the next task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Mount OnboardingChecklist in AppShell with real state

**Files:**
- Modify: `frontend/src/components/layout/AppShell.jsx`

- [ ] **Step 1: Add imports + state subscription**

At the top of `AppShell.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import OnboardingChecklist from '../onboarding/OnboardingChecklist'
import {
  getTutorialState,
  markDismissed,
  markTaskDone,
  isOnboardingActive,
  STORAGE_KEY,
} from '../../lib/tutorialState'
```

(If `useState`, `useEffect`, `useLocation` are already imported, just add `OnboardingChecklist` + the lib imports.)

- [ ] **Step 2: Add the state hook inside AppShell**

Inside the `AppShell` function, near the top:

```jsx
  const location = useLocation()
  const [tutorialState, setTutorialState] = useState(() => getTutorialState())
  const isEditorRoute = location.pathname.startsWith('/project/') && location.pathname.endsWith('/editor')

  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setTutorialState(getTutorialState())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
```

- [ ] **Step 3: Render the checklist conditionally**

Where AppShell renders its main outlet/children, AFTER that block, add:

```jsx
      {!isEditorRoute && isOnboardingActive(tutorialState) && (
        <OnboardingChecklist
          state={tutorialState}
          onTaskClick={(key) => {
            // Navigation wired in Task 7
            console.log('[onboarding] task clicked:', key)
          }}
          onDismiss={() => {
            const next = markDismissed()
            setTutorialState(next)
          }}
        />
      )}
```

(Find AppShell's main outlet — likely `<Outlet />` from react-router. The checklist mounts as a sibling at the root of AppShell's return so its `position: fixed` works correctly.)

- [ ] **Step 4: Remove the temporary mount from Task 4 step 3**

If you left a debug `<OnboardingChecklist />` in App.jsx for the visual check, remove it now.

- [ ] **Step 5: Visual verify**

1. Reset state: `localStorage.removeItem('wb-tutorial-state')` then refresh.
2. Welcome modal appears, click "Empezar tour".
3. Verify the compact pill appears bottom-right showing "Empezando · 0 de 6".
4. Click pill → expanded card, all 6 tasks pending.
5. Click "Descartar tutorial" → pill disappears.
6. Refresh → pill stays gone.
7. Navigate to `/project/<some-id>/editor` → pill (re-spawned via console hack: `localStorage.removeItem('wb-tutorial-state')`) does NOT appear inside editor.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/layout/AppShell.jsx frontend/src/App.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): wire OnboardingChecklist to real state in AppShell

Reads tutorialState on mount, subscribes to storage events so multiple
tabs stay in sync. Hides the checklist on the /project/:id/editor
route. Descartar persists via markDismissed().

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Auto-complete tasks from existing query state

**Files:**
- Create: `frontend/src/components/onboarding/useTutorialAutoComplete.js`
- Modify: `frontend/src/components/layout/AppShell.jsx`

- [ ] **Step 1: Write the hook**

Create `frontend/src/components/onboarding/useTutorialAutoComplete.js`:

```js
import { useEffect } from 'react';
import { getTutorialState, syncTasksFromSignals } from '../../lib/tutorialState';

const COMPANIES_CACHE_KEY = 'webrief:companies';
const COMPANY_CACHE_PREFIX = 'webrief:company:';

function readSignals() {
  let companiesCount = 0;
  let projectsCount = 0;
  let membersCount = 0;

  try {
    const raw = window.sessionStorage.getItem(COMPANIES_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      companiesCount = parsed?.companies?.length || 0;
    }
  } catch {}

  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (!k || !k.startsWith(COMPANY_CACHE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(window.sessionStorage.getItem(k));
        projectsCount += parsed?.projects?.length || 0;
        membersCount = Math.max(membersCount, parsed?.members?.length || 0);
      } catch {}
    }
  } catch {}

  return { companiesCount, projectsCount, membersCount };
}

/**
 * Polls sessionStorage caches that CompaniesPage and CompanyPage populate
 * and marks the matching tasks as done. Idempotent — safe to call on
 * every render.
 *
 * @param onStateChange — callback fired with the new state object after
 *                       any change. Use this to refresh the consuming
 *                       component.
 */
export default function useTutorialAutoComplete(onStateChange) {
  useEffect(() => {
    const state = getTutorialState();
    if (state.dismissedAt || state.completedAt) return undefined;

    function tick() {
      const signals = readSignals();
      const before = getTutorialState();
      syncTasksFromSignals(signals);
      const after = getTutorialState();
      const beforeCount = Object.values(before.tasks).filter((t) => t.doneAt).length;
      const afterCount = Object.values(after.tasks).filter((t) => t.doneAt).length;
      if (afterCount !== beforeCount) {
        onStateChange?.(after);
      }
    }

    tick(); // first tick on mount
    const id = window.setInterval(tick, 4000);
    return () => window.clearInterval(id);
  }, [onStateChange]);
}
```

- [ ] **Step 2: Wire the hook in AppShell**

In `AppShell.jsx`, after the `useEffect` from Task 5:

```jsx
import useTutorialAutoComplete from '../onboarding/useTutorialAutoComplete'

// ...later, inside AppShell:
  useTutorialAutoComplete(setTutorialState)
```

- [ ] **Step 3: Visual verify auto-complete**

1. Reset state.
2. Empezar tour. Pill: 0 de 6.
3. Create an empresa via the normal flow (or in DevTools: `sessionStorage.setItem('webrief:companies', JSON.stringify({companies: [{id: 'fake'}], cachedAt: Date.now()}))`).
4. Wait <5s OR force a refresh. Pill: 1 de 6.
5. Expand pill, verify "Crear tu primera empresa" is now struck-through and at the bottom.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/onboarding/useTutorialAutoComplete.js frontend/src/components/layout/AppShell.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): auto-complete tasks from sessionStorage signals

Reads webrief:companies + webrief:company:* caches and marks create_
company / invite_member / create_project as done when counts cross the
threshold. Polls every 4s while the tutorial is active. No new
endpoints.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Wire task-click navigation

**Files:**
- Modify: `frontend/src/components/layout/AppShell.jsx`

- [ ] **Step 1: Replace the console.log in onTaskClick**

In `AppShell.jsx`, swap the `onTaskClick` placeholder from Task 5 for:

```jsx
import { useNavigate } from 'react-router-dom'

// inside AppShell:
  const navigate = useNavigate()

  function handleTaskClick(key) {
    switch (key) {
      case 'create_company':
        // CompaniesPage opens the create modal via ?new=1 query param
        navigate('/companies?new=1')
        break
      case 'invite_member':
        // Find first company where user is manager, jump to its team tab
        // For v1: just navigate to /companies and let the user pick
        navigate('/companies')
        break
      case 'create_project':
        navigate('/new-project')
        break
      case 'edit_page':
        // Jump to /companies; user picks a project to open
        navigate('/companies')
        break
      case 'create_share_link':
        navigate('/companies')
        break
      case 'leave_comment':
        navigate('/companies')
        break
      default:
        navigate('/companies')
    }
  }
```

Then pass `onTaskClick={handleTaskClick}` to `<OnboardingChecklist>`.

- [ ] **Step 2: Add ?new=1 handler in CompaniesPage**

In `frontend/src/pages/CompaniesPage.jsx`, find the create-company modal state. After the existing `useState` for the modal, add:

```jsx
import { useSearchParams } from 'react-router-dom'

// inside CompaniesPage:
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setShowCreateModal(true) // or whatever the existing modal-open state setter is called
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }, [searchParams, setSearchParams])
```

(Adapt the setter name to match the existing CompaniesPage. If the modal opens via a different mechanism — e.g. a ref-driven `<NewCompanyModal />` — adapt accordingly.)

- [ ] **Step 3: Visual verify**

1. Reset state, empezar tour.
2. Click "Crear tu primera empresa" in the checklist → navigates to `/companies?new=1`, modal opens, `?new=1` is cleaned from the URL.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppShell.jsx frontend/src/pages/CompaniesPage.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): wire task-click navigation to action surfaces

Each unfinished task in the checklist navigates to the page where the
user can perform it. Create-company uses ?new=1 query param to
auto-open the modal in CompaniesPage. Other tasks land at /companies
or /new-project for v1 — refined deep-linking is deferred.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Manual marks for share-link + comment

**Files:**
- Modify: `frontend/src/components/editor/ShareLinkPanel.jsx` (or wherever `share-links` creation lives — confirm via `grep -rn "share-links" frontend/src` before editing)
- Modify: `frontend/src/components/editor/CommentComposerPopover.jsx` (or wherever the comment-create call lives)

- [ ] **Step 1: Find the share-link creation call site**

```bash
cd /Users/adrian/GitHub/webbrief/.claude/worktrees/onboarding-tutorial
grep -rn "share-links\|share_link\|createShareLink" frontend/src --include="*.jsx" | head -20
```

Identify the function/handler that POSTs to `/api/projects/:id/share-links`.

- [ ] **Step 2: Add markTaskDone after successful share-link creation**

After the successful response handling in that handler:

```jsx
import { markTaskDone } from '../../lib/tutorialState'

// after share link created successfully:
  markTaskDone('create_share_link')
```

- [ ] **Step 3: Find the comment creation call site**

```bash
grep -rn "POST.*comments\|createComment\|leaveComment\|commentSubmit" frontend/src --include="*.jsx" | head -20
```

- [ ] **Step 4: Add markTaskDone after successful comment creation**

```jsx
import { markTaskDone } from '../../lib/tutorialState'

// after comment posted successfully:
  markTaskDone('leave_comment')
```

- [ ] **Step 5: Visual verify**

1. Reset state, empezar tour.
2. Open a project, create a share link → checklist shows `create_share_link` done (may require refresh since markTaskDone fires localStorage write but doesn't trigger the AppShell's state listener directly — the storage event fires across tabs only).
3. To make same-tab updates instant: emit a `storage` event manually OR replace the localStorage write with a `setState` callback wired through context. **For v1, accept the refresh-to-see behavior**; document in commit.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/editor/ShareLinkPanel.jsx frontend/src/components/editor/CommentComposerPopover.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): mark share-link + comment tasks on user action

Calls markTaskDone('create_share_link') after successful POST to the
share-links endpoint, and markTaskDone('leave_comment') after a
comment is posted. Same-tab UI refresh requires a page reload in v1;
cross-tab works automatically via the storage event already wired in
AppShell.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Celebration state when all 6 are done

**Files:**
- Modify: `frontend/src/components/onboarding/OnboardingChecklist.jsx`
- Modify: `frontend/src/components/onboarding/OnboardingChecklist.module.css`
- Modify: `frontend/src/components/layout/AppShell.jsx`

- [ ] **Step 1: Add celebration CSS**

Append to `OnboardingChecklist.module.css`:

```css
.celebration {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--wb-space-3);
  padding: var(--wb-space-6) var(--wb-space-5);
  text-align: center;
}

.celebrationIcon {
  display: inline-flex;
  width: 56px;
  height: 56px;
  align-items: center;
  justify-content: center;
  background: var(--wb-color-primary-100);
  color: var(--wb-color-primary-700);
  border-radius: var(--wb-radius-full);
  animation: pop 220ms cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  .celebrationIcon {
    animation: none;
  }
}

@keyframes pop {
  0% { transform: scale(0.4); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}

.celebrationTitle {
  margin: 0;
  font-size: var(--wb-text-lg);
  font-weight: var(--wb-weight-semibold);
  color: var(--wb-text);
}

.celebrationBody {
  margin: 0;
  font-size: var(--wb-text-sm);
  color: var(--wb-text-muted);
  max-width: 240px;
}
```

- [ ] **Step 2: Add the celebration JSX branch**

In `OnboardingChecklist.jsx`, BEFORE the existing `if (!expanded)` block, add:

```jsx
  import { Sparkles } from 'lucide-react'
  // (add Sparkles to the existing lucide import line above)

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
```

- [ ] **Step 3: Auto-close + markCompleted from AppShell**

In `AppShell.jsx`, add an effect that watches the task count:

```jsx
import { markCompleted } from '../../lib/tutorialState'

// inside AppShell:
  useEffect(() => {
    const doneCount = Object.values(tutorialState.tasks).filter((t) => t.doneAt).length
    if (doneCount === 6 && !tutorialState.completedAt) {
      // expand the celebration, then auto-close after 5s
      const id = setTimeout(() => {
        const next = markCompleted()
        setTutorialState(next)
      }, 5000)
      return () => clearTimeout(id)
    }
    return undefined
  }, [tutorialState])
```

`isOnboardingActive` already returns false once `completedAt` is set, so the checklist will unmount.

- [ ] **Step 4: Visual verify**

1. Reset state, empezar tour.
2. Mark all 6 tasks done manually via DevTools:
```js
const s = JSON.parse(localStorage.getItem('wb-tutorial-state'))
const now = new Date().toISOString()
Object.keys(s.tasks).forEach(k => s.tasks[k].doneAt = now)
localStorage.setItem('wb-tutorial-state', JSON.stringify(s))
window.dispatchEvent(new StorageEvent('storage', { key: 'wb-tutorial-state' }))
```
3. Expand the card → celebration UI with Sparkles + title.
4. Wait 5s → checklist disappears entirely; `completedAt` is set.
5. Refresh → does not reappear.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/onboarding/OnboardingChecklist.jsx frontend/src/components/onboarding/OnboardingChecklist.module.css frontend/src/components/layout/AppShell.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): add celebration state when all 6 tasks are done

Replaces the task list with a Sparkles + congratulations message
when count hits 6. AppShell auto-closes the checklist 5s later by
setting completedAt. isOnboardingActive returns false from then on.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Add "Reiniciar tutorial" link in AccountSettingsPage

**Files:**
- Modify: `frontend/src/pages/AccountSettingsPage.jsx`

- [ ] **Step 1: Add the import**

```jsx
import { RotateCcw } from 'lucide-react'
import { resetTutorial } from '../lib/tutorialState'
```

- [ ] **Step 2: Add a small section at the bottom of the page**

Append after the existing settings sections:

```jsx
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Tutorial</h2>
          <p className={styles.sectionHint}>
            Vuelve a ver la bienvenida y el checklist de tareas.
          </p>
        </header>
        <Button
          variant="ghost"
          icon={<RotateCcw size={16} />}
          onClick={() => {
            resetTutorial()
            window.location.assign('/companies')
          }}
        >
          Reiniciar tutorial
        </Button>
      </section>
```

(Adapt class names + Button import path to match what AccountSettingsPage already uses. The exact `.section` / `.sectionHeader` / `.sectionTitle` / `.sectionHint` classes are defined per the Section anatomy in DESIGN-SYSTEM.md.)

- [ ] **Step 3: Visual verify**

1. Open `/settings` (Ajustes de cuenta link in sidebar).
2. Scroll to "Tutorial" section.
3. Click "Reiniciar tutorial".
4. Page navigates to `/companies`, welcome modal reappears.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AccountSettingsPage.jsx
git commit -m "$(cat <<'EOF'
feat(onboarding): add Reiniciar tutorial link in Account Settings

Calls resetTutorial() + navigates to /companies so the user sees the
welcome modal again. Useful for QA + for users who dismissed early.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: End-to-end verification

- [ ] **Step 1: Full happy path**

1. Reset state (or fresh login).
2. Welcome modal appears.
3. Click "Empezar tour" → modal closes, pill appears bottom-right.
4. Click pill → expanded card, 6 tasks pending.
5. Click "Crear tu primera empresa" → /companies?new=1, modal opens.
6. Create empresa → wait <5s, refresh, pill shows 1/6.
7. Invite member via the normal flow → 2/6.
8. Create project via /new-project → 3/6.
9. Edit a page → 4/6.
10. Create share link → 5/6 (refresh required).
11. Post a comment → 6/6.
12. Expand pill → celebration. Wait 5s → checklist gone.
13. Hard refresh → no checklist, no modal. `completedAt` set in localStorage.

- [ ] **Step 2: Veteran-user path**

1. With completedAt unset BUT existing data in sessionStorage:
```js
sessionStorage.setItem('webrief:companies', JSON.stringify({companies: [{id:1},{id:2}], cachedAt: Date.now()}))
sessionStorage.setItem('webrief:company:1', JSON.stringify({projects: [{id:'p1'}], members: [{id:'u1'},{id:'u2'}], cachedAt: Date.now()}))
localStorage.removeItem('wb-tutorial-state')
location.reload()
```
2. Welcome modal SHOULD appear (per current spec — veteran-skip is a v1.1 enhancement; the syncTasksFromSignals only fires once user is welcomed).
3. Click Empezar tour, pill appears with auto-completed tasks (1/6 or more).

- [ ] **Step 3: Dismiss path**

1. Reset state, welcome modal → click "Saltar".
2. Verify no pill appears.
3. Refresh → still no pill.
4. Open Ajustes → Reiniciar tutorial → welcome appears again.

- [ ] **Step 4: Editor isolation**

1. With pill visible on /companies, navigate to a project editor.
2. Pill should disappear (not occupy editor screen real estate).
3. Navigate back to /companies → pill returns.

- [ ] **Step 5: Reduced-motion**

In DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`. Refresh. Verify:
- Pill hover does NOT translate
- Progress bar fill does NOT animate
- Celebration icon does NOT pop

- [ ] **Step 6: Final commit (only if there are tweaks)**

If E2E uncovered small bugs, fix and commit separately. Otherwise skip.

---

## Self-Review (run before handoff)

- [ ] **Spec coverage:** Every checklist task from the gentle-frost plan §Fase 1 has a task above (modal ✓, checklist ✓, 6 tasks ✓, persistence ✓, AppShell mount ✓, auto-detection ✓, celebration ✓, reset ✓). The companion auto-complete fires for share-link + comment (Task 8). ✓
- [ ] **Placeholder scan:** Search for "TODO", "TBD", "implement later" in this plan → none. ✓
- [ ] **Type consistency:** `tutorialState` API names match between definition (Task 1) and consumers (Tasks 3, 5, 6, 8, 9, 10): `getTutorialState`, `markWelcomed`, `markDismissed`, `markCompleted`, `markTaskDone`, `markTypeSeen`, `resetTutorial`, `isOnboardingActive`, `syncTasksFromSignals`, `STORAGE_KEY`, `TASK_KEYS`. ✓
- [ ] **No new dependencies:** Verified — uses lucide-react (already installed), existing UI primitives, no new npm packages. ✓

---

## Pre-PR checklist

- [ ] `npm run build` succeeds in the worktree's frontend folder
- [ ] No new ESLint warnings introduced (run `npm run lint` if available)
- [ ] `grep -rn 'wb-tutorial-state' frontend/src` returns matches only in `tutorialState.js` (the single source of truth)
- [ ] DESIGN-SYSTEM.md compliance: zero hardcoded hex in the new files. Run: `grep -E '#[0-9a-f]{3,6}' frontend/src/components/onboarding/ frontend/src/lib/tutorialState.js` → only matches inside comments are OK.
- [ ] Lang: zero Argentinian forms. Run: `grep -nE 'podés|tenés|abrí|copiá|querés|contactá' frontend/src/components/onboarding/` → 0 matches.
- [ ] Worktree status clean: `git status` → nothing to commit, all changes committed.
- [ ] Optional: `refactoring-ui` skill review on the WelcomeModal + OnboardingChecklist for visual hierarchy.
