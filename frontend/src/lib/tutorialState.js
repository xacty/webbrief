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
 *   },
 *   firstTimeTooltips: {
 *     [tooltipKey]: ISOString | null
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

const FIRSTTIME_KEYS = ['editor-sections', 'notifications-bell', 'editor-modes', 'faq-add'];

function emptyState() {
  return {
    welcomedAt: null,
    dismissedAt: null,
    completedAt: null,
    tasks: Object.fromEntries(TASK_KEYS.map((k) => [k, { doneAt: null }])),
    typeExplainers: Object.fromEntries(TYPE_KEYS.map((k) => [k, null])),
    firstTimeTooltips: Object.fromEntries(FIRSTTIME_KEYS.map((k) => [k, null])),
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
      firstTimeTooltips: { ...base.firstTimeTooltips, ...(parsed.firstTimeTooltips || {}) },
    };
  } catch {
    return emptyState();
  }
}

function writeState(next) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // QuotaExceededError or similar — onboarding state is not persisted
    // this render; the user's progress is not saved but the app stays up.
  }
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

export function markFirstTimeSeen(key) {
  const state = getTutorialState();
  // Permissive: allow unknown keys (callers may add new anchors)
  if (state.firstTimeTooltips[key]) return state;
  const next = {
    ...state,
    firstTimeTooltips: { ...state.firstTimeTooltips, [key]: new Date().toISOString() },
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
 * Should the onboarding UI be shown? Returns false once the user
 * dismissed or completed the tutorial.
 *
 * Veteran-user auto-skip is intentionally deferred — see
 * syncTasksFromSignals for the in-progress auto-complete behavior.
 *
 * @param state — result of getTutorialState()
 */
export function isOnboardingActive(state) {
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

export { STORAGE_KEY, FIRSTTIME_KEYS };
