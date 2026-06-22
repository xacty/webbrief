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
  } catch {
    // Ignore — empty signal is safer than crashing the hook
  }

  try {
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i);
      if (!k || !k.startsWith(COMPANY_CACHE_PREFIX)) continue;
      try {
        const parsed = JSON.parse(window.sessionStorage.getItem(k));
        projectsCount += parsed?.projects?.length || 0;
        membersCount = Math.max(membersCount, parsed?.members?.length || 0);
      } catch {
        // Skip this company's cache, keep going
      }
    }
  } catch {
    // sessionStorage iteration failed — bail
  }

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
