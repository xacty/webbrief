import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  shouldNotifyManagerAssigned,
  buildManagerNotificationRow,
  buildCompanyUrl,
  buildAddedByLabel,
} from '../src/lib/managerNotifications.js'

// -------- shouldNotifyManagerAssigned --------

test('shouldNotifyManagerAssigned: true when role=manager AND action=assigned_existing', () => {
  assert.equal(shouldNotifyManagerAssigned({ role: 'manager', action: 'assigned_existing' }), true)
})

test('shouldNotifyManagerAssigned: false when role is not manager', () => {
  assert.equal(shouldNotifyManagerAssigned({ role: 'editor', action: 'assigned_existing' }), false)
  assert.equal(shouldNotifyManagerAssigned({ role: 'designer', action: 'assigned_existing' }), false)
})

test('shouldNotifyManagerAssigned: false when action is invited/reinvited', () => {
  assert.equal(shouldNotifyManagerAssigned({ role: 'manager', action: 'invited' }), false)
  assert.equal(shouldNotifyManagerAssigned({ role: 'manager', action: 'reinvited' }), false)
})

test('shouldNotifyManagerAssigned: false on missing inputs', () => {
  assert.equal(shouldNotifyManagerAssigned({}), false)
  assert.equal(shouldNotifyManagerAssigned(null), false)
  assert.equal(shouldNotifyManagerAssigned(undefined), false)
})

// -------- buildManagerNotificationRow --------

test('buildManagerNotificationRow: required fields populated', () => {
  const row = buildManagerNotificationRow({
    targetUserId: 'u-target',
    companyId: 'c-1',
    companyName: 'ACME',
    actor: { id: 'u-admin', fullName: 'Adrián', email: 'admin@example.com' },
  })

  assert.equal(row.user_id, 'u-target')
  assert.equal(row.project_id, null)
  assert.equal(row.event_type, 'company_membership_added')
  assert.equal(row.title, 'Te agregaron como manager')
  assert.match(row.body, /Adrián/)
  assert.match(row.body, /ACME/)
  assert.equal(row.metadata.companyId, 'c-1')
  assert.equal(row.metadata.role, 'manager')
  assert.equal(row.metadata.addedBy, 'u-admin')
})

test('buildManagerNotificationRow: actor without fullName uses email', () => {
  const row = buildManagerNotificationRow({
    targetUserId: 'u-target',
    companyId: 'c-1',
    companyName: 'ACME',
    actor: { id: 'u-admin', email: 'admin@example.com' },
  })
  assert.match(row.body, /admin@example\.com/)
})

test('buildManagerNotificationRow: actor null uses generic label', () => {
  const row = buildManagerNotificationRow({
    targetUserId: 'u-target',
    companyId: 'c-1',
    companyName: 'ACME',
    actor: null,
  })
  assert.match(row.body, /agregaron/)
  assert.equal(row.metadata.addedBy, null)
})

// -------- buildCompanyUrl --------

test('buildCompanyUrl: uses FRONTEND_URL when set', () => {
  const url = buildCompanyUrl({ companyId: 'c-1', frontendUrl: 'https://webrief.app' })
  assert.equal(url, 'https://webrief.app/companies/c-1')
})

test('buildCompanyUrl: localhost fallback when frontendUrl missing', () => {
  const url = buildCompanyUrl({ companyId: 'c-1', frontendUrl: undefined })
  assert.equal(url, 'http://localhost:5173/companies/c-1')
})

test('buildCompanyUrl: strips trailing slash from frontendUrl', () => {
  const url = buildCompanyUrl({ companyId: 'c-1', frontendUrl: 'https://webrief.app/' })
  assert.equal(url, 'https://webrief.app/companies/c-1')
})

// -------- buildAddedByLabel --------

test('buildAddedByLabel: prefers fullName, falls back to email, then empty string', () => {
  assert.equal(buildAddedByLabel({ fullName: 'Adrián', email: 'a@b.c' }), 'Adrián')
  assert.equal(buildAddedByLabel({ fullName: '', email: 'a@b.c' }), 'a@b.c')
  assert.equal(buildAddedByLabel({ fullName: null, email: null }), '')
  assert.equal(buildAddedByLabel(null), '')
})
