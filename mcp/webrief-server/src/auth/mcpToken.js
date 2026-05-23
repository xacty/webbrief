/**
 * mcpToken.js — Auth helpers for the WeBrief MCP server.
 *
 * Two modes:
 *
 *   - stdio (dev/local): one user per process; token comes from the
 *     WEBRIEF_MCP_TOKEN env var.
 *   - HTTP (production): one process serves many users; token comes from
 *     the per-request AsyncLocalStorage context (see session/requestContext.js).
 *
 * The helpers below transparently prefer the per-request token when one is
 * available, falling back to the env var otherwise. This means handler code
 * doesn't need to know which mode it's running in.
 */

import { getCurrentToken } from '../session/requestContext.js';

/**
 * The structured error response returned when no MCP token is configured.
 *
 * @typedef {{ status: 'error', tool: string, error: { code: string, message: string } }} MissingTokenError
 */

/**
 * Returns the mcpt_* token to use for backend requests.
 * Throws if no token is configured.
 *
 * @returns {string} The raw token value (including the `mcpt_` prefix).
 */
export function getMcpToken() {
  const token = getCurrentToken();
  if (!token) {
    throw new Error(
      'No MCP token available. ' +
        'In HTTP mode this means no request context was opened; in stdio mode it ' +
        'means WEBRIEF_MCP_TOKEN is not set.',
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

/**
 * Checks whether a token is available without throwing.
 * Returns a structured MCP error object if missing, or null if ok.
 *
 * @param {string} toolName  The tool's `name` export (used in the error envelope).
 * @returns {MissingTokenError | null}
 */
export function checkMcpToken(toolName) {
  if (!getCurrentToken()) {
    return {
      status: 'error',
      tool: toolName,
      error: {
        code: 'mcp_token_missing',
        message:
          'No MCP token available for this request. ' +
          'Generate a token in WeBrief → Account Settings → MCP Tokens. ' +
          'In stdio mode: set WEBRIEF_MCP_TOKEN before starting the server. ' +
          'In HTTP mode: pass it as Authorization: Bearer mcpt_... on each request.',
      },
    };
  }
  return null;
}
