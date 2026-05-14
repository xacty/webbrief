import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregateRateLimitBlocks,
  isRateLimitBlockActive,
} from '../src/routes/securityBlocksHelpers.js'

// -------- aggregateRateLimitBlocks --------

test('aggregateRateLimitBlocks: groups by metadata.key and surfaces latest', () => {
  const events = [
    { id: 'e1', created_at: '2026-05-14T10:00:00Z', metadata: { key: 'invite-user:u1:c1', limiter: 'invite-user', retryAfterSeconds: 900, violations: 1 } },
    { id: 'e2', created_at: '2026-05-14T10:05:00Z', metadata: { key: 'invite-user:u1:c1', limiter: 'invite-user', retryAfterSeconds: 1800, violations: 2 } },
    { id: 'e3', created_at: '2026-05-14T10:02:00Z', metadata: { key: 'password-reset:u2:t1', limiter: 'password-reset', retryAfterSeconds: 900, violations: 1 } },
  ]

  const result = aggregateRateLimitBlocks(events)

  assert.equal(result.length, 2)

  const inviteRow = result.find((r) => r.key === 'invite-user:u1:c1')
  assert.equal(inviteRow.limiter, 'invite-user')
  assert.equal(inviteRow.violations, 2) // latest event wins
  assert.equal(inviteRow.lastBlockedAt, '2026-05-14T10:05:00Z')
  assert.equal(inviteRow.eventCount, 2)
})

test('aggregateRateLimitBlocks: skips events missing metadata.key', () => {
  const events = [
    { id: 'e1', created_at: '2026-05-14T10:00:00Z', metadata: { limiter: 'x' } }, // no key
    { id: 'e2', created_at: '2026-05-14T10:05:00Z', metadata: { key: 'k1', limiter: 'x', violations: 1 } },
  ]

  const result = aggregateRateLimitBlocks(events)
  assert.equal(result.length, 1)
  assert.equal(result[0].key, 'k1')
})

test('aggregateRateLimitBlocks: empty input', () => {
  assert.deepEqual(aggregateRateLimitBlocks([]), [])
  assert.deepEqual(aggregateRateLimitBlocks(null), [])
  assert.deepEqual(aggregateRateLimitBlocks(undefined), [])
})

// -------- isRateLimitBlockActive --------

test('isRateLimitBlockActive: true when now - lastBlockedAt < blockMs', () => {
  const lastBlockedAt = '2026-05-14T10:00:00Z'
  const now = new Date('2026-05-14T10:10:00Z') // +10min
  const blockMs = 15 * 60_000 // 15min
  assert.equal(isRateLimitBlockActive({ lastBlockedAt, now, blockMs }), true)
})

test('isRateLimitBlockActive: false when now - lastBlockedAt >= blockMs', () => {
  const lastBlockedAt = '2026-05-14T10:00:00Z'
  const now = new Date('2026-05-14T10:20:00Z') // +20min
  const blockMs = 15 * 60_000 // 15min
  assert.equal(isRateLimitBlockActive({ lastBlockedAt, now, blockMs }), false)
})

test('isRateLimitBlockActive: false when blockMs missing', () => {
  const lastBlockedAt = '2026-05-14T10:00:00Z'
  const now = new Date('2026-05-14T10:05:00Z')
  assert.equal(isRateLimitBlockActive({ lastBlockedAt, now, blockMs: null }), false)
  assert.equal(isRateLimitBlockActive({ lastBlockedAt, now, blockMs: 0 }), false)
})

test('isRateLimitBlockActive: false when lastBlockedAt missing', () => {
  const now = new Date()
  assert.equal(isRateLimitBlockActive({ lastBlockedAt: null, now, blockMs: 60000 }), false)
})
