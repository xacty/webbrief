import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  canManageMembershipRanked,
  canAssignRoleRanked,
  wouldLeaveCompanyWithoutAdmin,
  canSendAccessRanked,
} from '../src/lib/membershipPermissions.js'

// -------------------- canManageMembershipRanked --------------------

test('canManageMembershipRanked: platform-admin can manage anyone', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'admin',
    actorMemberships: [],
    companyId: 'c1',
    targetRole: 'admin',
  }), true)
})

test('canManageMembershipRanked: company-admin can manage manager + below', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'admin' }]
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'manager' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'editor' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'designer' }), true)
})

test('canManageMembershipRanked: company-admin cannot manage peer admin', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    companyId: 'c1',
    targetRole: 'admin',
  }), false)
})

test('canManageMembershipRanked: manager cannot manage admin', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    companyId: 'c1',
    targetRole: 'admin',
  }), false)
})

test('canManageMembershipRanked: manager cannot manage peer manager', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    companyId: 'c1',
    targetRole: 'manager',
  }), false)
})

test('canManageMembershipRanked: manager can manage editor + workers', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'manager' }]
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'editor' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'content_writer' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'designer' }), true)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'developer' }), true)
})

test('canManageMembershipRanked: editor outranks workers only (cannot manage peer-editor or manager)', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'editor' }]
  // editor (rank 2) cannot manage manager (rank 3) or peer editor (rank 2)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'manager' }), false)
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'editor' }), false)
  // editor (rank 2) CAN manage workers (rank 1) per the rank model in shared/userRoles.js
  assert.equal(canManageMembershipRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', targetRole: 'designer' }), true)
})

test('canManageMembershipRanked: actor without membership in company returns false', () => {
  assert.equal(canManageMembershipRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c2', role: 'admin' }],
    companyId: 'c1',
    targetRole: 'editor',
  }), false)
})

// -------------------- canAssignRoleRanked --------------------

test('canAssignRoleRanked: platform-admin can assign anything', () => {
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'admin', actorMemberships: [], companyId: 'c1', role: 'admin' }), true)
})

test('canAssignRoleRanked: company-admin can assign all roles below admin', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'admin' }]
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', role: 'manager' }), true)
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', role: 'editor' }), true)
})

test('canAssignRoleRanked: company-admin cannot assign peer admin', () => {
  assert.equal(canAssignRoleRanked({
    actorPlatformRole: 'user',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    companyId: 'c1',
    role: 'admin',
  }), false)
})

test('canAssignRoleRanked: manager cannot assign admin or peer manager', () => {
  const actorMemberships = [{ companyId: 'c1', role: 'manager' }]
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', role: 'admin' }), false)
  assert.equal(canAssignRoleRanked({ actorPlatformRole: 'user', actorMemberships, companyId: 'c1', role: 'manager' }), false)
})

// -------------------- wouldLeaveCompanyWithoutAdmin --------------------

test('wouldLeaveCompanyWithoutAdmin: demoting sole admin → true', () => {
  assert.equal(wouldLeaveCompanyWithoutAdmin({
    currentRole: 'admin',
    nextRole: 'manager',
    companyAdminUserIds: ['u1'],
    targetUserId: 'u1',
  }), true)
})

test('wouldLeaveCompanyWithoutAdmin: demoting one of multiple admins → false', () => {
  assert.equal(wouldLeaveCompanyWithoutAdmin({
    currentRole: 'admin',
    nextRole: 'manager',
    companyAdminUserIds: ['u1', 'u2'],
    targetUserId: 'u1',
  }), false)
})

test('wouldLeaveCompanyWithoutAdmin: promoting to admin → false', () => {
  assert.equal(wouldLeaveCompanyWithoutAdmin({
    currentRole: 'manager',
    nextRole: 'admin',
    companyAdminUserIds: ['u1'],
    targetUserId: 'u2',
  }), false)
})

test('wouldLeaveCompanyWithoutAdmin: non-admin role change is always false', () => {
  assert.equal(wouldLeaveCompanyWithoutAdmin({
    currentRole: 'editor',
    nextRole: 'designer',
    companyAdminUserIds: ['u1'],
    targetUserId: 'u2',
  }), false)
})

// -------------------- canSendAccessRanked --------------------

test('canSendAccessRanked: platform-admin can send to anyone', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'admin' },
    targetUserId: 't',
    actorMemberships: [],
    targetMemberships: [],
  }), true)
})

test('canSendAccessRanked: self forbidden', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'admin' },
    targetUserId: 'a',
  }), false)
})

test('canSendAccessRanked: QA never', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'qa' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    targetMemberships: [{ companyId: 'c1', role: 'editor' }],
  }), false)
})

test('canSendAccessRanked: company-admin can send to manager + below in same company', () => {
  const args = {
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
  }
  assert.equal(canSendAccessRanked({ ...args, targetMemberships: [{ companyId: 'c1', role: 'manager' }] }), true)
  assert.equal(canSendAccessRanked({ ...args, targetMemberships: [{ companyId: 'c1', role: 'editor' }] }), true)
})

test('canSendAccessRanked: company-admin cannot send to peer admin', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    targetMemberships: [{ companyId: 'c1', role: 'admin' }],
  }), false)
})

test('canSendAccessRanked: manager cannot send to peer manager', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
    targetMemberships: [{ companyId: 'c1', role: 'manager' }],
  }), false)
})

test('canSendAccessRanked: manager can send to editor + below', () => {
  const args = {
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'manager' }],
  }
  assert.equal(canSendAccessRanked({ ...args, targetMemberships: [{ companyId: 'c1', role: 'editor' }] }), true)
  assert.equal(canSendAccessRanked({ ...args, targetMemberships: [{ companyId: 'c1', role: 'designer' }] }), true)
})

test('canSendAccessRanked: cross-company → false', () => {
  assert.equal(canSendAccessRanked({
    actor: { id: 'a', platformRole: 'user' },
    targetUserId: 't',
    actorMemberships: [{ companyId: 'c1', role: 'admin' }],
    targetMemberships: [{ companyId: 'c2', role: 'editor' }],
  }), false)
})
