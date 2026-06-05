// backend/test/oauth-flow.test.js
import assert from 'node:assert/strict'
import { test, describe } from 'node:test'
import { createHash } from 'node:crypto'
import { canonicalizeResourceUri, verifyPkceChallenge, isAllowedRedirectUri } from '../src/lib/oauthHelpers.js'

// We re-use the unit tests' confidence in oauthHelpers and only assert
// contract behavior here. Full end-to-end is covered by the smoke script (Task 14).

describe('OAuth flow contract checks', () => {
  test('canonicalizeResourceUri preserves localhost:3000 dev URI', () => {
    assert.equal(canonicalizeResourceUri('http://localhost:3000/api/mcp'), 'http://localhost:3000/api/mcp')
  })

  test('PKCE with valid 43-char verifier passes (boundary)', () => {
    // 43-char min per RFC 7636
    const verifier = 'a'.repeat(43)
    const challenge = createHash('sha256').update(verifier).digest('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    assert.equal(verifyPkceChallenge({ verifier, challenge, method: 'S256' }), true)
  })

  test('isAllowedRedirectUri rejects 0 and >65535 ports', () => {
    assert.equal(isAllowedRedirectUri('http://localhost:0/callback'), false)
    assert.equal(isAllowedRedirectUri('http://localhost:70000/callback'), false)
  })
})
