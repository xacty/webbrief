import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildInviteEmailPayload } from '../src/lib/authEmails.js'

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
