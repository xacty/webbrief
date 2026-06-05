// backend/test/oauth-helpers.test.js
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canonicalizeResourceUri,
  generateClientId,
  generateOpaqueToken,
  hashToken,
  verifyPkceChallenge,
  isAllowedRedirectUri,
  buildWwwAuthenticateHeader,
} from '../src/lib/oauthHelpers.js'

// ─── canonicalizeResourceUri ───
test('canonicalizeResourceUri: lowercases scheme + host, strips trailing slash + fragment + query', () => {
  assert.equal(canonicalizeResourceUri('HTTPS://WebRief.APP/api/mcp/'), 'https://webrief.app/api/mcp')
  assert.equal(canonicalizeResourceUri('https://webrief.app/api/mcp#frag'), 'https://webrief.app/api/mcp')
  assert.equal(canonicalizeResourceUri('https://webrief.app/api/mcp?x=1'), 'https://webrief.app/api/mcp')
  assert.equal(canonicalizeResourceUri('http://localhost:3000/api/mcp'), 'http://localhost:3000/api/mcp')
})

test('canonicalizeResourceUri: throws on invalid URI', () => {
  assert.throws(() => canonicalizeResourceUri(''), /Invalid resource URI/)
  assert.throws(() => canonicalizeResourceUri('not a url'), /Invalid resource URI/)
})

// ─── generateClientId / generateOpaqueToken ───
test('generateClientId: returns mcpc_ prefix + 16 hex', () => {
  const id = generateClientId()
  assert.match(id, /^mcpc_[0-9a-f]{16}$/)
})

test('generateOpaqueToken: returns prefix + 32 hex', () => {
  assert.match(generateOpaqueToken('at_'), /^at_[0-9a-f]{32}$/)
  assert.match(generateOpaqueToken('rt_'), /^rt_[0-9a-f]{32}$/)
  assert.match(generateOpaqueToken('code_'), /^code_[0-9a-f]{32}$/)
})

test('generateOpaqueToken: each call returns distinct value', () => {
  const a = generateOpaqueToken('at_')
  const b = generateOpaqueToken('at_')
  assert.notEqual(a, b)
})

// ─── hashToken ───
test('hashToken: returns 64-char hex sha256', () => {
  const hash = hashToken('mcpt_abc')
  assert.equal(hash.length, 64)
  assert.match(hash, /^[0-9a-f]{64}$/)
})

test('hashToken: deterministic', () => {
  assert.equal(hashToken('foo'), hashToken('foo'))
})

// ─── verifyPkceChallenge ───
test('verifyPkceChallenge: S256 valid verifier passes', () => {
  // Verifier from RFC 7636 §B (test vector)
  const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  assert.equal(verifyPkceChallenge({ verifier, challenge, method: 'S256' }), true)
})

test('verifyPkceChallenge: S256 invalid verifier fails', () => {
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
  assert.equal(verifyPkceChallenge({ verifier: 'wrong', challenge, method: 'S256' }), false)
})

test('verifyPkceChallenge: plain method rejected', () => {
  assert.equal(verifyPkceChallenge({ verifier: 'x', challenge: 'x', method: 'plain' }), false)
})

test('verifyPkceChallenge: verifier too short rejected (< 43)', () => {
  assert.equal(verifyPkceChallenge({ verifier: 'short', challenge: 'x', method: 'S256' }), false)
})

test('verifyPkceChallenge: verifier too long rejected (> 128)', () => {
  assert.equal(verifyPkceChallenge({ verifier: 'a'.repeat(129), challenge: 'x', method: 'S256' }), false)
})

// ─── isAllowedRedirectUri ───
test('isAllowedRedirectUri: allows Claude.ai exact match', () => {
  assert.equal(isAllowedRedirectUri('https://claude.ai/api/mcp/auth_callback'), true)
})

test('isAllowedRedirectUri: allows http://localhost:<port>/callback', () => {
  assert.equal(isAllowedRedirectUri('http://localhost:33421/callback'), true)
  assert.equal(isAllowedRedirectUri('http://localhost:1/callback'), true)
})

test('isAllowedRedirectUri: allows http://127.0.0.1:<port>/callback', () => {
  assert.equal(isAllowedRedirectUri('http://127.0.0.1:55555/callback'), true)
})

test('isAllowedRedirectUri: rejects loopback without port', () => {
  assert.equal(isAllowedRedirectUri('http://localhost/callback'), false)
})

test('isAllowedRedirectUri: rejects unknown HTTPS hosts', () => {
  assert.equal(isAllowedRedirectUri('https://evil.example.com/cb'), false)
})

test('isAllowedRedirectUri: rejects http on non-loopback', () => {
  assert.equal(isAllowedRedirectUri('http://claude.ai/api/mcp/auth_callback'), false)
})

test('isAllowedRedirectUri: rejects javascript: and other schemes', () => {
  assert.equal(isAllowedRedirectUri('javascript:alert(1)'), false)
  assert.equal(isAllowedRedirectUri('data:,x'), false)
  assert.equal(isAllowedRedirectUri('file:///etc/passwd'), false)
})

test('isAllowedRedirectUri: rejects empty / null / non-string', () => {
  assert.equal(isAllowedRedirectUri(''), false)
  assert.equal(isAllowedRedirectUri(null), false)
  assert.equal(isAllowedRedirectUri(undefined), false)
  assert.equal(isAllowedRedirectUri(42), false)
})

// ─── buildWwwAuthenticateHeader ───
test('buildWwwAuthenticateHeader: returns spec-compliant string', () => {
  const header = buildWwwAuthenticateHeader({
    issuer: 'https://webrief.app',
    resourcePath: '/api/mcp',
    scope: 'mcp:full',
  })
  assert.equal(
    header,
    'Bearer resource_metadata="https://webrief.app/.well-known/oauth-protected-resource/api/mcp", scope="mcp:full"'
  )
})
