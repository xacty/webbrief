import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canSendAccess,
  decideSendAccessAction,
  validateResetRequestRow,
} from '../src/lib/sendAccess.js'

// -------- canSendAccess --------

test('canSendAccess: admin can target any user (except self)', () => {
  const admin = { id: 'a1', platformRole: 'admin' }
  assert.equal(canSendAccess({ actor: admin, targetUserId: 't1', actorMemberships: [], targetMemberships: [] }), true)
  assert.equal(canSendAccess({ actor: admin, targetUserId: 'a1', actorMemberships: [], targetMemberships: [] }), false, 'admin cannot self-target')
})

test('canSendAccess: manager can target users sharing at least one company where actor is manager', () => {
  const manager = { id: 'm1', platformRole: 'user' }
  const result = canSendAccess({
    actor: manager,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  })
  assert.equal(result, true)
})

test('canSendAccess: manager cannot target user when shared company role is NOT manager', () => {
  const manager = { id: 'm1', platformRole: 'user' }
  const result = canSendAccess({
    actor: manager,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'editor' }], // actor is editor, not manager
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: manager cannot target user without shared company', () => {
  const manager = { id: 'm1', platformRole: 'user' }
  const result = canSendAccess({
    actor: manager,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c2', role: 'editor' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: QA cannot target anyone', () => {
  const qa = { id: 'q1', platformRole: 'qa' }
  const result = canSendAccess({
    actor: qa,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: editor cannot target anyone', () => {
  const editor = { id: 'e1', platformRole: 'user' }
  const result = canSendAccess({
    actor: editor,
    targetUserId: 't1',
    actorMemberships: [{ companyId: 'c1', role: 'editor' }],
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: manager cannot self-target either', () => {
  const manager = { id: 'm1', platformRole: 'user' }
  const result = canSendAccess({
    actor: manager,
    targetUserId: 'm1',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c1', role: 'manager' }],
  })
  assert.equal(result, false)
})

test('canSendAccess: missing actor or targetUserId returns false', () => {
  assert.equal(canSendAccess({ actor: null, targetUserId: 't1' }), false)
  assert.equal(canSendAccess({ actor: { id: 'a1' }, targetUserId: null }), false)
})

// -------- decideSendAccessAction --------

test('decideSendAccessAction: never activated → invite_resent', () => {
  const result = decideSendAccessAction({ authUser: { id: 'u1', last_sign_in_at: null } })
  assert.deepEqual(result, { action: 'invite_resent', ttlSeconds: 86400 })
})

test('decideSendAccessAction: active → reset_sent', () => {
  const result = decideSendAccessAction({ authUser: { id: 'u1', last_sign_in_at: '2026-01-01T00:00:00Z' } })
  assert.deepEqual(result, { action: 'reset_sent', ttlSeconds: 3600 })
})

test('decideSendAccessAction: no auth user → not_found', () => {
  const result = decideSendAccessAction({ authUser: null })
  assert.deepEqual(result, { action: 'not_found', ttlSeconds: 0 })
})

// -------- validateResetRequestRow --------

test('validateResetRequestRow: valid when expires_at in future and used_at null', () => {
  const now = new Date('2026-05-14T12:00:00Z')
  const row = {
    expires_at: '2026-05-14T12:30:00Z',
    used_at: null,
  }
  assert.deepEqual(validateResetRequestRow({ row, now }), { valid: true, reason: null })
})

test('validateResetRequestRow: expired when now > expires_at', () => {
  const now = new Date('2026-05-14T14:00:00Z')
  const row = {
    expires_at: '2026-05-14T12:30:00Z',
    used_at: null,
  }
  assert.deepEqual(validateResetRequestRow({ row, now }), { valid: false, reason: 'expired' })
})

test('validateResetRequestRow: used when used_at is set', () => {
  const now = new Date('2026-05-14T12:00:00Z')
  const row = {
    expires_at: '2026-05-14T12:30:00Z',
    used_at: '2026-05-14T11:55:00Z',
  }
  assert.deepEqual(validateResetRequestRow({ row, now }), { valid: false, reason: 'used' })
})

test('validateResetRequestRow: no_request when row is null', () => {
  const now = new Date('2026-05-14T12:00:00Z')
  assert.deepEqual(validateResetRequestRow({ row: null, now }), { valid: false, reason: 'no_request' })
})
