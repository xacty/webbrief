/**
 * requestContext.js — per-request execution context using AsyncLocalStorage.
 *
 * The MCP server runs in two modes:
 *
 *   1. stdio (legacy/dev): one process per user; the user's mcpt_* token comes
 *      from `WEBRIEF_MCP_TOKEN` env var and never changes for the lifetime of
 *      the process. There is no concurrency — one tool call at a time.
 *
 *   2. HTTP (production, multi-tenant): a single Express process serves many
 *      users. Each incoming POST /api/mcp request carries its own `Authorization`
 *      header with a different `mcpt_*` token. Tool handlers must see ONLY
 *      that request's token + currentUser, never another's.
 *
 * AsyncLocalStorage is Node's primitive for "thread-local but for async code".
 * We open a fresh store at the request boundary with `runInRequestContext`,
 * and any handler running inside that boundary can call `getRequestContext()`
 * to read its token / user without taking it as a parameter.
 *
 * For stdio mode the store is never opened; the helpers below fall back to
 * the env-var-based behavior so existing stdio callers keep working.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * @typedef {Object} RequestContext
 * @property {string} token        The mcpt_* token for this request
 * @property {object} [currentUser] The authenticated user record (HTTP mode)
 * @property {Map<string, string>} [activeCompanyByToken]
 *           Shared map of token → activeCompanyId. Same instance across calls
 *           in the HTTP server (passed in by the entry point) so the active
 *           selection survives between back-to-back requests from the same
 *           token.
 */

const storage = new AsyncLocalStorage();

/**
 * Run `fn` with the given request context bound to the async chain.
 * Returns whatever `fn` returns.
 *
 * @template T
 * @param {RequestContext} ctx
 * @param {() => Promise<T> | T} fn
 * @returns {Promise<T> | T}
 */
export function runInRequestContext(ctx, fn) {
  return storage.run(ctx, fn);
}

/**
 * Returns the current request context, or null if no context is active
 * (i.e. we're running in stdio mode).
 *
 * @returns {RequestContext | null}
 */
export function getRequestContext() {
  return storage.getStore() ?? null;
}

/**
 * Returns the mcpt_* token for the current call, preferring the per-request
 * context and falling back to the env var for stdio mode.
 *
 * @returns {string | null}
 */
export function getCurrentToken() {
  const ctx = getRequestContext();
  if (ctx?.token) return ctx.token;
  return process.env.WEBRIEF_MCP_TOKEN ?? null;
}

/**
 * Returns the authenticated user record for the current call, or null if
 * we're in stdio mode (where the backend resolves the user from the token).
 *
 * @returns {object | null}
 */
export function getCurrentUser() {
  return getRequestContext()?.currentUser ?? null;
}
