import assert from 'node:assert/strict'
import { test } from 'node:test'
import { decideEnsureProfileAction } from '../src/lib/users.js'

test('decideEnsureProfileAction: case A — no auth user exists', () => {
  const result = decideEnsureProfileAction({ authUser: null, profile: null })
  assert.equal(result.action, 'invited')
})

test('decideEnsureProfileAction: case A — no auth user but stale profile exists', () => {
  // Edge case: profile orphan (auth user was deleted but profile remained).
  // Treat as Case A — invite fresh.
  const result = decideEnsureProfileAction({
    authUser: null,
    profile: { id: 'stale', email: 'x@y.com' },
  })
  assert.equal(result.action, 'invited')
})

test('decideEnsureProfileAction: case B — auth user exists, never signed in', () => {
  const result = decideEnsureProfileAction({
    authUser: { id: 'u1', email: 'x@y.com', last_sign_in_at: null },
    profile: { id: 'u1', email: 'x@y.com' },
  })
  assert.equal(result.action, 'reinvited')
  assert.equal(result.userId, 'u1')
})

test('decideEnsureProfileAction: case B — auth user exists, never signed in, no profile yet', () => {
  // Edge case: auth user was created but profile upsert failed last time.
  const result = decideEnsureProfileAction({
    authUser: { id: 'u1', email: 'x@y.com', last_sign_in_at: null },
    profile: null,
  })
  assert.equal(result.action, 'reinvited')
  assert.equal(result.userId, 'u1')
})

test('decideEnsureProfileAction: case C/D — auth user signed in at least once', () => {
  const result = decideEnsureProfileAction({
    authUser: { id: 'u1', email: 'x@y.com', last_sign_in_at: '2026-04-01T00:00:00Z' },
    profile: { id: 'u1', email: 'x@y.com' },
  })
  assert.equal(result.action, 'assigned_existing')
  assert.equal(result.userId, 'u1')
})
