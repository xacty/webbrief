/**
 * activeCompany.js — per-token "active company" session state.
 *
 * Behavior is mode-dependent:
 *
 *   - stdio: one user per process, so a module-level variable is safe.
 *
 *   - HTTP: one Express process serves many users concurrently. Using a
 *     module-level variable would cross-contaminate users — user A picks
 *     company X, user B picks company Y, user A's next request would see
 *     Y. To prevent that we key the state by the per-request token using
 *     a shared `Map<token, companyId>` passed in via requestContext.
 *
 * The HTTP entry point creates that Map once at server boot and threads it
 * through every request via `runInRequestContext({ token, activeCompanyByToken, ... })`.
 *
 * If no request context is open (stdio mode), the helpers fall back to a
 * module-level variable so existing stdio callers keep working unchanged.
 */

import { getRequestContext } from './requestContext.js';

// ──────────────────────────────────────────────────────────────────────────────
// stdio fallback — single variable
// ──────────────────────────────────────────────────────────────────────────────

/** @type {string | null} */
let stdioActiveCompanyId = null;

// ──────────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Returns the active company ID for the current request, or null.
 * @returns {string | null}
 */
export function getActiveCompanyId() {
  const ctx = getRequestContext();
  if (ctx?.activeCompanyByToken && ctx.token) {
    return ctx.activeCompanyByToken.get(ctx.token) ?? null;
  }
  return stdioActiveCompanyId;
}

/**
 * Sets the active company ID for the current request.
 * @param {string} id  UUID of the company to activate
 */
export function setActiveCompanyId(id) {
  const ctx = getRequestContext();
  if (ctx?.activeCompanyByToken && ctx.token) {
    ctx.activeCompanyByToken.set(ctx.token, id);
    return;
  }
  stdioActiveCompanyId = id;
}

/**
 * Clears the active company ID for the current request.
 */
export function clearActiveCompanyId() {
  const ctx = getRequestContext();
  if (ctx?.activeCompanyByToken && ctx.token) {
    ctx.activeCompanyByToken.delete(ctx.token);
    return;
  }
  stdioActiveCompanyId = null;
}

// Test-only: reset both modes' state.
export function _resetActiveCompanyForTests() {
  stdioActiveCompanyId = null;
  const ctx = getRequestContext();
  if (ctx?.activeCompanyByToken) ctx.activeCompanyByToken.clear();
}
