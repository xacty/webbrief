/**
 * activeCompany.js — Module-level session state for v1 single-process MCP.
 *
 * Stores the user's currently selected active company for this MCP session.
 * Module-level state is correct for v1 (one MCP process per user, stdio transport).
 * Multi-tenant / per-session isolation comes in v2 with HTTP/SSE transport.
 */

/** @type {string | null} */
let activeCompanyId = null

/**
 * Returns the currently active company ID, or null if none has been set.
 * @returns {string | null}
 */
export function getActiveCompanyId() {
  return activeCompanyId
}

/**
 * Sets the active company ID for this session.
 * @param {string} id  UUID of the company to activate
 */
export function setActiveCompanyId(id) {
  activeCompanyId = id
}

/**
 * Clears the active company ID (resets to no selection).
 */
export function clearActiveCompanyId() {
  activeCompanyId = null
}
