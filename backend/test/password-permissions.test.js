import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canSetPassword,
  canViewSessions,
  canRevealIp,
} from '../src/lib/passwordPermissions.js'

// Common test fixtures
const PLATFORM_ADMIN = { id: 'pa', platformRole: 'admin' }
const PLATFORM_USER = { id: 'u1', platformRole: 'user' }
const PLATFORM_QA = { id: 'qa', platformRole: 'qa' }

// -------------------- canSetPassword --------------------

test('canSetPassword: platform-admin can set anyone except self', () => {
  assert.equal(
    canSetPassword({
      actor: PLATFORM_ADMIN,
      target: PLATFORM_USER,
      actorMemberships: [],
      targetMemberships: [],
    }),
    true,
  )
  // self denied
  assert.equal(
    canSetPassword({
      actor: PLATFORM_ADMIN,
      target: { id: 'pa', platformRole: 'admin' },
      actorMemberships: [],
      targetMemberships: [],
    }),
    false,
  )
})

test('canSetPassword: QA always denied', () => {
  assert.equal(
    canSetPassword({
      actor: PLATFORM_QA,
      target: PLATFORM_USER,
      actorMemberships: [{ companyId: 'c1', role: 'admin' }],
      targetMemberships: [{ companyId: 'c1', role: 'editor' }],
    }),
    false,
  )
})

test('canSetPassword: company-admin can set manager/editor/workers in same company', () => {
  const actor = PLATFORM_USER
  const am = [{ companyId: 'c1', role: 'admin' }]
  assert.equal(
    canSetPassword({
      actor,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'manager' }],
    }),
    true,
  )
  assert.equal(
    canSetPassword({
      actor,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'editor' }],
    }),
    true,
  )
  assert.equal(
    canSetPassword({
      actor,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'designer' }],
    }),
    true,
  )
})

test('canSetPassword: company-admin cannot set peer admin', () => {
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: [{ companyId: 'c1', role: 'admin' }],
      targetMemberships: [{ companyId: 'c1', role: 'admin' }],
    }),
    false,
  )
})

test('canSetPassword: company-admin cannot set platform-admin', () => {
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'admin' },
      actorMemberships: [{ companyId: 'c1', role: 'admin' }],
      targetMemberships: [],
    }),
    false,
  )
})

test('canSetPassword: manager can set editor + workers', () => {
  const am = [{ companyId: 'c1', role: 'manager' }]
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'editor' }],
    }),
    true,
  )
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'developer' }],
    }),
    true,
  )
})

test('canSetPassword: manager cannot set peer manager or admin', () => {
  const am = [{ companyId: 'c1', role: 'manager' }]
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'manager' }],
    }),
    false,
  )
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'admin' }],
    }),
    false,
  )
})

test('canSetPassword: editor cannot set anyone, including workers (no user-manager role)', () => {
  const am = [{ companyId: 'c1', role: 'editor' }]
  // editor → manager: denied (rank check would have caught this anyway)
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'manager' }],
    }),
    false,
  )
  // editor → worker: denied by USER_MANAGER_ROLES gate (editor is NOT a user-manager role).
  // Closes the privilege-escalation vulnerability where editor (rank 2) > worker (rank 1)
  // would bypass the rank check despite the spec requiring editor to be blocked entirely.
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: am,
      targetMemberships: [{ companyId: 'c1', role: 'designer' }],
    }),
    false,
  )
})

test('canSetPassword: worker roles cannot set anyone', () => {
  for (const workerRole of ['content_writer', 'designer', 'developer']) {
    const am = [{ companyId: 'c1', role: workerRole }]
    assert.equal(
      canSetPassword({
        actor: PLATFORM_USER,
        target: { id: 't', platformRole: 'user' },
        actorMemberships: am,
        targetMemberships: [{ companyId: 'c1', role: 'designer' }],
      }),
      false,
      `${workerRole} should NOT be able to set passwords`,
    )
  }
})

test('canViewSessions: editor cannot view sessions (mirrors canSetPassword gate)', () => {
  assert.equal(
    canViewSessions({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: [{ companyId: 'c1', role: 'editor' }],
      targetMemberships: [{ companyId: 'c1', role: 'designer' }],
    }),
    false,
  )
})

test('canSetPassword: cross-company → false', () => {
  assert.equal(
    canSetPassword({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: [{ companyId: 'c1', role: 'admin' }],
      targetMemberships: [{ companyId: 'c2', role: 'editor' }],
    }),
    false,
  )
})

test('canSetPassword: missing actor or target → false', () => {
  assert.equal(
    canSetPassword({
      actor: null,
      target: PLATFORM_USER,
      actorMemberships: [],
      targetMemberships: [],
    }),
    false,
  )
  assert.equal(
    canSetPassword({
      actor: PLATFORM_ADMIN,
      target: null,
      actorMemberships: [],
      targetMemberships: [],
    }),
    false,
  )
})

// -------------------- canViewSessions --------------------
// Same matrix as canSetPassword — just verify it delegates.

test('canViewSessions: delegates to canSetPassword', () => {
  const positive = canViewSessions({
    actor: PLATFORM_ADMIN,
    target: PLATFORM_USER,
    actorMemberships: [],
    targetMemberships: [],
  })
  assert.equal(positive, true)
  const negative = canViewSessions({
    actor: PLATFORM_QA,
    target: PLATFORM_USER,
    actorMemberships: [],
    targetMemberships: [],
  })
  assert.equal(negative, false)
})

// -------------------- canRevealIp --------------------
// Stricter: only platform-admin OR company-admin in shared company.

test('canRevealIp: platform-admin can reveal anyone', () => {
  assert.equal(
    canRevealIp({
      actor: PLATFORM_ADMIN,
      target: PLATFORM_USER,
      actorMemberships: [],
      targetMemberships: [],
    }),
    true,
  )
})

test('canRevealIp: QA always denied', () => {
  assert.equal(
    canRevealIp({
      actor: PLATFORM_QA,
      target: PLATFORM_USER,
      actorMemberships: [{ companyId: 'c1', role: 'admin' }],
      targetMemberships: [{ companyId: 'c1', role: 'editor' }],
    }),
    false,
  )
})

test('canRevealIp: company-admin can reveal target in shared company', () => {
  assert.equal(
    canRevealIp({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: [{ companyId: 'c1', role: 'admin' }],
      targetMemberships: [{ companyId: 'c1', role: 'editor' }],
    }),
    true,
  )
})

test('canRevealIp: manager CANNOT reveal (tighter than canViewSessions)', () => {
  assert.equal(
    canRevealIp({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: [{ companyId: 'c1', role: 'manager' }],
      targetMemberships: [{ companyId: 'c1', role: 'editor' }],
    }),
    false,
  )
})

test('canRevealIp: editor/worker cannot reveal', () => {
  assert.equal(
    canRevealIp({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: [{ companyId: 'c1', role: 'editor' }],
      targetMemberships: [{ companyId: 'c1', role: 'designer' }],
    }),
    false,
  )
})

test('canRevealIp: cross-company → false', () => {
  assert.equal(
    canRevealIp({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: [{ companyId: 'c1', role: 'admin' }],
      targetMemberships: [{ companyId: 'c2', role: 'editor' }],
    }),
    false,
  )
})

test('canRevealIp: company-admin in c1, target in both c1 and c2 → true (any shared admin-company counts)', () => {
  assert.equal(
    canRevealIp({
      actor: PLATFORM_USER,
      target: { id: 't', platformRole: 'user' },
      actorMemberships: [{ companyId: 'c1', role: 'admin' }],
      targetMemberships: [
        { companyId: 'c1', role: 'editor' },
        { companyId: 'c2', role: 'manager' },
      ],
    }),
    true,
  )
})
