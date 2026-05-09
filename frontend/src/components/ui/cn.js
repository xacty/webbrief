/**
 * Internal class-name composer for components/ui/.
 *
 * Joins all truthy string arguments with single spaces. Falsy values
 * (false, null, undefined, '', 0, NaN) are skipped silently. One level
 * of nested arrays is flattened so callers can write
 * `cn('btn', [danger && 'btn--danger'])` ergonomically.
 *
 * NOT exported from `index.js` — internal-only per Phase 2 UI-SPEC §File Layout.
 *
 * @param {...(string | false | null | undefined | 0 | string[])} args
 * @returns {string}
 */
export default function cn(...args) {
  const parts = [];
  for (const arg of args) {
    if (!arg) continue;
    if (Array.isArray(arg)) {
      for (const inner of arg) {
        if (inner) parts.push(inner);
      }
      continue;
    }
    parts.push(arg);
  }
  return parts.join(' ');
}
