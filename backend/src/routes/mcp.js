// backend/src/routes/mcp.js — POST /api/mcp HTTP endpoint for the WeBrief MCP
// server. Mounted in backend/src/index.js. Behind requireAuth (mcpt_ fast-path
// already handles the token). The handler factory wraps each call in an
// AsyncLocalStorage request context so the per-user token + currentUser flow
// to the MCP tool handlers without globals.

import express from 'express'
import { requireAuth } from '../middleware/auth.js'
// Cross-package import: pulls the MCP HTTP transport from the mcp/webrief-server
// folder in the same monorepo. The SDK deps resolve out of mcp/webrief-server/node_modules
// because Node lookups follow the importing file's location.
import { createMcpHttpHandler } from '../../../mcp/webrief-server/src/http.js'

const router = express.Router()

const handleMcp = createMcpHttpHandler()

// POST /api/mcp — the only MCP endpoint. Streamable HTTP transport handles both
// the request/response model (JSON-RPC over HTTP) and the optional SSE upgrade
// for streaming notifications back to the client.
router.post('/', requireAuth, handleMcp)

// GET /api/mcp — some MCP clients (Claude Code's `/mcp` flow) issue a HEAD/GET
// probe to discover that an MCP endpoint exists at this URL. Reply with a
// minimal JSON-RPC error so the client can recognize it without ambiguity.
router.get('/', (req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: {
      code: -32000,
      message: 'MCP endpoint accepts POST only. Configure your client with --transport http.',
    },
    id: null,
  })
})

export default router
