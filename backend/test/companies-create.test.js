import assert from 'node:assert/strict'
import { test } from 'node:test'

// We test only the permission gate logic by extracting it.
// Real route requires Supabase mocks which are heavy; we lift the
// gate into a pure function exported from companies.js (Task 1.3).

import { canCreateCompany } from '../src/routes/companies.js'

test('canCreateCompany: admin can create real or test', () => {
  assert.equal(canCreateCompany({ platformRole: 'admin' }, false), true)
  assert.equal(canCreateCompany({ platformRole: 'admin' }, true), true)
})

test('canCreateCompany: QA can create test only', () => {
  assert.equal(canCreateCompany({ platformRole: 'qa' }, false), false)
  assert.equal(canCreateCompany({ platformRole: 'qa' }, true), true)
})

test('canCreateCompany: user cannot create at all', () => {
  assert.equal(canCreateCompany({ platformRole: 'user' }, false), false)
  assert.equal(canCreateCompany({ platformRole: 'user' }, true), false)
})

test('canCreateCompany: missing user returns false', () => {
  assert.equal(canCreateCompany(null, true), false)
  assert.equal(canCreateCompany(undefined, false), false)
})
