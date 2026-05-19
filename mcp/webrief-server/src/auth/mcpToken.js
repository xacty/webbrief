/**
 * mcpToken.js — Auth helpers for the WeBrief MCP server.
 *
 * In v1 local mode the user sets WEBRIEF_MCP_TOKEN in their environment before
 * launching the server. Real token validation happens server-side via the
 * `requireAuth` fast-path — the MCP server just forwards the token as
 * `Authorization: Bearer mcpt_...` on every backend request.
 */

/**
 * The structured error response returned when no MCP token is configured.
 * Tool handlers should check this before calling the backend client.
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

/**
 * Checks whether WEBRIEF_MCP_TOKEN is set without throwing.
 * Returns a structured MCP error object if missing, or null if ok.
 *
 * Use at the top of every tool handler before calling the backend client:
 *   const tokenError = checkMcpToken(name);
 *   if (tokenError) return tokenError;
 *
 * @param {string} toolName  The tool's `name` export (used in the error envelope).
 * @returns {MissingTokenError | null}
 */
export function checkMcpToken(toolName) {
  if (!process.env.WEBRIEF_MCP_TOKEN) {
    return {
      status: 'error',
      tool: toolName,
      error: {
        code: 'mcp_token_missing',
        message:
          'WEBRIEF_MCP_TOKEN is not set. ' +
          'Generate a token in WeBrief → Account Settings → MCP Tokens, ' +
          'then set the environment variable before starting the MCP server.',
      },
    };
  }
  return null;
}
