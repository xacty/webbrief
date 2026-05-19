/**
 * webbriefClient.js — HTTP client stub for Fase 0.
 *
 * Defines the shape of the client and the helper for building authenticated
 * requests. Does NOT make real HTTP calls yet — all tool handlers are no-ops
 * in Fase 0. Real implementation comes in Fase 1/N+3.
 *
 * Uses native fetch (Node >= 18). No external HTTP library needed for v1.
 */

import { getAuthHeader } from '../auth/mcpToken.js';

const DEFAULT_BACKEND_URL = 'http://localhost:3000';

function getBackendUrl() {
  return (process.env.WEBRIEF_BACKEND_URL ?? DEFAULT_BACKEND_URL).replace(/\/$/, '');
}

/**
 * Build a base RequestInit with the Authorization header pre-filled.
 *
 * @param {RequestInit} [options]
 * @returns {RequestInit}
 */
function buildRequestOptions(options = {}) {
  return {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: getAuthHeader(),
      ...options.headers,
    },
  };
}

/**
 * GET /api/<path>
 *
 * @param {string} path  e.g. '/projects/123'
 * @returns {Promise<unknown>}
 */
export async function get(path) {
  const url = `${getBackendUrl()}/api${path}`;
  const res = await fetch(url, buildRequestOptions({ method: 'GET' }));
  return handleResponse(res);
}

/**
 * POST /api/<path>
 *
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<unknown>}
 */
export async function post(path, body) {
  const url = `${getBackendUrl()}/api${path}`;
  const res = await fetch(
    url,
    buildRequestOptions({ method: 'POST', body: JSON.stringify(body) })
  );
  return handleResponse(res);
}

/**
 * PATCH /api/<path>
 *
 * @param {string} path
 * @param {unknown} body
 * @returns {Promise<unknown>}
 */
export async function patch(path, body) {
  const url = `${getBackendUrl()}/api${path}`;
  const res = await fetch(
    url,
    buildRequestOptions({ method: 'PATCH', body: JSON.stringify(body) })
  );
  return handleResponse(res);
}

/**
 * @param {Response} res
 * @returns {Promise<unknown>}
 */
async function handleResponse(res) {
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const message = json?.message ?? json?.error ?? res.statusText;
    const err = new Error(`WeBrief API error ${res.status}: ${message}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}
