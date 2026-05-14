import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildInviteEmailPayload, sendInviteEmail } from '../src/lib/authEmails.js'

test('buildInviteEmailPayload: basic shape', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    fullName: 'Ana Pérez',
    actionLink: 'https://webrief.app/auth/set-password#access_token=abc',
    companyName: 'Avinova',
  })

  assert.equal(payload.to, 'user@example.com')
  assert.match(payload.subject, /Avinova/)
  assert.match(payload.subject, /WeBrief/)
  assert.match(payload.html, /Ana Pérez/)
  assert.match(payload.html, /https:\/\/webrief\.app\/auth\/set-password/)
  assert.match(payload.text, /Ana Pérez/)
})

test('buildInviteEmailPayload: omits company name when not provided', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    fullName: 'Bob',
    actionLink: 'https://webrief.app/auth/set-password',
  })

  assert.equal(payload.to, 'user@example.com')
  assert.match(payload.subject, /WeBrief/)
  assert.doesNotMatch(payload.html, /undefined/)
  assert.doesNotMatch(payload.text, /undefined/)
})

test('buildInviteEmailPayload: handles missing fullName gracefully', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    actionLink: 'https://webrief.app/auth/set-password',
  })

  assert.match(payload.html, /Hola/)
  assert.doesNotMatch(payload.html, /undefined/)
})

test('sendInviteEmail: returns missing_recipient when to is falsy', async () => {
  const result = await sendInviteEmail({
    fullName: 'Test',
    actionLink: 'https://webrief.app/auth/set-password',
  })
  assert.equal(result.sent, false)
  assert.equal(result.reason, 'missing_recipient')
})

test('sendInviteEmail: returns no_api_key when RESEND_API_KEY is unset', async () => {
  const originalKey = process.env.RESEND_API_KEY
  delete process.env.RESEND_API_KEY
  try {
    const result = await sendInviteEmail({
      to: 'user@example.com',
      fullName: 'Test',
      actionLink: 'https://webrief.app/auth/set-password',
    })
    assert.equal(result.sent, false)
    assert.equal(result.reason, 'no_api_key')
  } finally {
    if (originalKey !== undefined) process.env.RESEND_API_KEY = originalKey
  }
})

test('buildInviteEmailPayload: escapes HTML in fullName to prevent injection', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    fullName: '<script>alert(1)</script>',
    actionLink: 'https://webrief.app/auth/set-password',
  })

  assert.doesNotMatch(payload.html, /<script>/)
  assert.match(payload.html, /&lt;script&gt;/)
})

test('buildInviteEmailPayload: escapes HTML in companyName', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    fullName: 'Ana',
    companyName: '"><img src=x onerror=alert(1)>',
    actionLink: 'https://webrief.app/auth/set-password',
  })

  assert.doesNotMatch(payload.html, /<img src=x onerror=/)
  // The escaped version should appear
  assert.match(payload.html, /&quot;&gt;&lt;img/)
})

test('buildInviteEmailPayload: escapes HTML in actionLink', () => {
  const payload = buildInviteEmailPayload({
    to: 'user@example.com',
    fullName: 'Ana',
    actionLink: 'https://example.com?a="><script>',
  })

  // The href and the visible span should both be escaped
  assert.doesNotMatch(payload.html, /<script>/)
  assert.match(payload.html, /&quot;&gt;&lt;script&gt;/)
})
