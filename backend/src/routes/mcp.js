// backend/src/routes/mcp.js — POST /api/mcp HTTP endpoint for the WeBrief MCP
// server. Mounted in backend/src/index.js. Wraps requireAuth so 401 responses
// include WWW-Authenticate per MCP spec §Resource Discovery.

import express from 'express'
import { requireAuth } from '../middleware/auth.js'
import { buildWwwAuthenticateHeader } from '../lib/oauthHelpers.js'
import { createMcpHttpHandler } from '../../../mcp/webrief-server/src/http.js'

const router = express.Router()

const handleMcp = createMcpHttpHandler()
const OAUTH_ISSUER = process.env.OAUTH_ISSUER || 'http://localhost:3000'
const WWW_AUTH = buildWwwAuthenticateHeader({
  issuer: OAUTH_ISSUER,
  resourcePath: '/api/mcp',
  scope: 'mcp:full',
})

// Wrap requireAuth so that any 401 from it includes the WWW-Authenticate
// header pointing to our resource metadata endpoint (RFC 9728 §5.1).
function requireAuthWithWww(req, res, next) {
  const originalStatus = res.status.bind(res)
  res.status = function patchedStatus(code) {
    if (code === 401) res.set('WWW-Authenticate', WWW_AUTH)
    return originalStatus(code)
  }
  requireAuth(req, res, next)
}

router.post('/', requireAuthWithWww, handleMcp)

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
