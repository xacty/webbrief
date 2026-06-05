// backend/src/lib/oauthHelpers.js
// Pure helpers for OAuth 2.1 + PKCE + DCR. No DB, no network.

import { randomBytes, createHash } from 'node:crypto'

/**
 * Canonical resource URI per RFC 8707 + MCP spec §Canonical Server URI.
 * Lowercase scheme + host, strip trailing slash, fragment, query.
 * Throws on invalid URI.
 */
export function canonicalizeResourceUri(uri) {
  if (typeof uri !== 'string' || !uri) {
    throw new Error('Invalid resource URI: empty or non-string')
  }
  let parsed
  try {
    parsed = new URL(uri)
  } catch {
    throw new Error('Invalid resource URI: not a URL')
  }
  const scheme = parsed.protocol.toLowerCase()
  const host = parsed.host.toLowerCase()
  let path = parsed.pathname
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1)
  return `${scheme}//${host}${path}`
}

/** Generate a new mcpc_<16 hex> client id. */
export function generateClientId() {
  return 'mcpc_' + randomBytes(8).toString('hex')
}

/** Generate an opaque token: <prefix><32 hex>. 16 bytes = 128 bits entropy. */
export function generateOpaqueToken(prefix) {
  return prefix + randomBytes(16).toString('hex')
}

/** SHA-256 hex digest of a token. */
export function hashToken(raw) {
  return createHash('sha256').update(raw).digest('hex')
}

/** Base64URL encode a buffer (no padding). */
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Verify a PKCE code_verifier against its code_challenge.
 * Only S256 is supported (plain is explicitly rejected per MCP spec).
 * Verifier length must be 43..128 chars (RFC 7636 §4.1).
 */
export function verifyPkceChallenge({ verifier, challenge, method }) {
  if (method !== 'S256') return false
  if (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) return false
  if (typeof challenge !== 'string' || !challenge) return false
  const computed = base64url(createHash('sha256').update(verifier).digest())
  return computed === challenge
}

/**
 * Validate redirect_uri per the locked policy.
 * Allowed:
 *   - https://claude.ai/api/mcp/auth_callback (exact)
 *   - http://localhost:<port>/callback (any port > 0)
 *   - http://127.0.0.1:<port>/callback (any port > 0)
 * Everything else rejected (RFC 8252 + locked policy).
 */
export function isAllowedRedirectUri(uri) {
  if (typeof uri !== 'string' || !uri) return false
  if (uri === 'https://claude.ai/api/mcp/auth_callback') return true
  let parsed
  try {
    parsed = new URL(uri)
  } catch {
    return false
  }
  if (parsed.protocol !== 'http:') return false
  const host = parsed.hostname
  if (host !== 'localhost' && host !== '127.0.0.1') return false
  if (!parsed.port) return false
  const portNum = Number(parsed.port)
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) return false
  if (parsed.pathname !== '/callback') return false
  return true
}

/**
 * Build the WWW-Authenticate header value for 401 responses from /api/mcp.
 * Per RFC 9728 §5.1 + MCP spec example.
 */
export function buildWwwAuthenticateHeader({ issuer, resourcePath, scope }) {
  const metadataUrl = `${issuer}/.well-known/oauth-protected-resource${resourcePath}`
  return `Bearer resource_metadata="${metadataUrl}", scope="${scope}"`
}
