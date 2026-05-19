/**
 * mcpToken.js — Auth stub for Fase 0.
 *
 * In v1 local mode the user sets WEBRIEF_MCP_TOKEN in their environment before
 * launching the server. Real token validation happens server-side via the
 * `requireAuth` fast-path — the MCP server just forwards the token as
 * `Authorization: Bearer mcpt_...` on every backend request.
 *
 * TODO (Fase 1): Support per-request token exchange or session-based token
 * refresh if the token management story evolves.
 */

/**
 * Returns the mcpt_* token to use for backend requests.
 * Throws if no token is configured.
 *
 * @returns {string} The raw token value (including the `mcpt_` prefix).
 */
export function getMcpToken() {
  const token = process.env.WEBRIEF_MCP_TOKEN;
  if (!token) {
    throw new Error(
      'WEBRIEF_MCP_TOKEN is not set. ' +
        'Set it to your mcpt_* token before starting the MCP server.'
    );
  }
  return token;
}

/**
 * Returns the Authorization header value for backend requests.
 *
 * @returns {string} e.g. "Bearer mcpt_abc123..."
 */
export function getAuthHeader() {
  return `Bearer ${getMcpToken()}`;
}
