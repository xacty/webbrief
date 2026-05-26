/**
 * previewStore.js — in-memory cache for `preview -> confirm -> apply` flows.
 *
 * Fase 2 introduces tools that return a `previewId`. The client (Codex/Claude)
 * inspects the preview, decides whether to apply it, and calls the matching
 * `apply` tool with the same `previewId`. The server side holds the preview
 * payload here until the apply call (or until the TTL elapses).
 *
 * Storage is process-local. Restarting the MCP server discards every preview,
 * which is acceptable for v1 (stdio = one process per client session).
 *
 * Each entry carries a `kind` so the apply tool can guard against misuse
 * (e.g. handing a `brief_prefill` previewId to `projects.createFromPreview`).
 */

import crypto from 'node:crypto';

const DEFAULT_TTL_SECONDS = 10 * 60; // 10 minutes
const MAX_ENTRIES = 256; // hard cap to bound memory growth

/** @type {Map<string, { kind: string, data: unknown, createdAt: number, expiresAt: number }>} */
const store = new Map();

function now() {
  return Date.now();
}

function gc() {
  const t = now();
  for (const [id, entry] of store) {
    if (entry.expiresAt <= t) store.delete(id);
  }
}

/**
 * Persist a preview and return its opaque id.
 *
 * @param {string}  kind
 * @param {unknown} data
 * @param {{ ttlSeconds?: number }} [opts]
 * @returns {{ previewId: string, expiresAt: string }}
 */
export function savePreview(kind, data, opts = {}) {
  if (!kind || typeof kind !== 'string') {
    throw new Error('savePreview: kind must be a non-empty string');
  }
  gc();

  // Evict the oldest entry when we hit the cap.
  if (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }

  const ttlSeconds = opts.ttlSeconds ?? DEFAULT_TTL_SECONDS;
  const previewId = `prev_${crypto.randomUUID()}`;
  const createdAt = now();
  const expiresAt = createdAt + ttlSeconds * 1000;
  store.set(previewId, { kind, data, createdAt, expiresAt });

  return { previewId, expiresAt: new Date(expiresAt).toISOString() };
}

/**
 * Retrieve a preview. Returns null if missing or expired.
 *
 * @param {string} previewId
 * @returns {{ kind: string, data: unknown, expiresAt: string } | null}
 */
export function getPreview(previewId) {
  gc();
  const entry = store.get(previewId);
  if (!entry) return null;
  return {
    kind: entry.kind,
    data: entry.data,
    expiresAt: new Date(entry.expiresAt).toISOString(),
  };
}

/**
 * Remove a preview. Safe to call with unknown ids.
 * @param {string} previewId
 */
export function deletePreview(previewId) {
  store.delete(previewId);
}

// Test-only: reset the store so tests start from a clean state.
export function _resetPreviewStoreForTests() {
  store.clear();
}

export const PREVIEW_STORE_LIMITS = Object.freeze({
  DEFAULT_TTL_SECONDS,
  MAX_ENTRIES,
});
