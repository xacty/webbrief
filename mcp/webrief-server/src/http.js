/**
 * http.js — HTTP transport entry point for the WeBrief MCP server.
 *
 * Exports a factory that builds an Express-compatible request handler. The
 * backend Express app mounts it under POST /api/mcp behind requireAuth.
 *
 * Each request:
 *   1. Express's requireAuth middleware authenticated the user (mcpt_ fast-path
 *      already exists in the backend).
 *   2. We extract the raw token from `Authorization: Bearer mcpt_...`.
 *   3. We open an AsyncLocalStorage request context with { token, currentUser,
 *      activeCompanyByToken } so handlers see the right per-request state.
 *   4. A fresh StreamableHTTPServerTransport instance handles the JSON-RPC
 *      message (stateless: a new server+transport per request keeps multi-
 *      tenant isolation airtight; cost is negligible — these objects are
 *      cheap).
 *
 * Note about the SDK's transport model: StreamableHTTPServerTransport supports
 * both stateful (session-id-based) and stateless modes. We use stateless
 * (`sessionIdGenerator: undefined`) because the MCP protocol per spec allows
 * sessionless servers and we want each request fully self-contained.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as tools from './tools/index.js';
import { runInRequestContext } from './session/requestContext.js';
import { SERVER_INSTRUCTIONS } from './instructions.js';

// Shared across all requests of this process. The Map<token, companyId> lives
// here so the user's active-company selection survives between back-to-back
// requests carrying the same token.
const activeCompanyByToken = new Map();

function buildServer() {
  const server = new McpServer(
    { name: 'webbrief', version: '0.1.0' },
    {
      capabilities: { tools: {} },
      instructions: SERVER_INSTRUCTIONS,
    },
  );
  for (const tool of Object.values(tools)) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (input) => {
        const result = await tool.handler(input);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      },
    );
  }
  return server;
}

/**
 * Express handler factory.
 *
 * Usage in backend Express:
 *   import { createMcpHttpHandler } from '../../mcp/webrief-server/src/http.js';
 *   const handleMcp = createMcpHttpHandler();
 *   router.post('/mcp', requireAuth, handleMcp);
 *
 * Requires `requireAuth` to have populated `req.currentUser` AND to have
 * accepted an `Authorization: Bearer mcpt_...` header (the existing
 * `mcpt_` fast-path).
 *
 * @returns {(req: import('express').Request, res: import('express').Response) => Promise<void>}
 */
export function createMcpHttpHandler() {
  return async function mcpHandler(req, res) {
    // Extract the raw token from the Authorization header. The middleware
    // already validated it; we just need its value to pass to handlers.
    const authHeader = req.get('Authorization') ?? '';
    const match = /^Bearer\s+(mcpt_[A-Za-z0-9_-]+)$/.exec(authHeader.trim());
    if (!match) {
      // Should be unreachable when requireAuth is upstream, but defend
      // against misconfiguration.
      res.status(401).json({
        jsonrpc: '2.0',
        error: {
          code: -32001,
          message:
            'MCP endpoint requires a Bearer mcpt_* token in the Authorization header.',
        },
        id: null,
      });
      return;
    }
    const token = match[1];

    const ctx = {
      token,
      currentUser: req.currentUser ?? null,
      activeCompanyByToken,
    };

    // Build a fresh server + transport per request for clean isolation.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true, // accept simple POST→JSON without SSE upgrade
    });

    // Best-effort cleanup if the client disconnects mid-stream.
    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await runInRequestContext(ctx, async () => {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      });
    } catch (err) {
      // If we haven't started writing the response yet, send a structured error.
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: `Internal MCP error: ${err?.message ?? 'unknown'}`,
          },
          id: null,
        });
      }
    }
  };
}
