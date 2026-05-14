import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildResetPasswordEmailPayload } from '../src/lib/authEmails.js'

test('buildResetPasswordEmailPayload: minimal shape with name and link', () => {
  const payload = buildResetPasswordEmailPayload({
    to: 'user@example.com',
    fullName: 'Pepa',
    actionLink: 'https://webrief.app/auth/set-password#type=recovery&access_token=abc',
    expiresAt: new Date('2026-05-14T15:30:00Z'),
  })

  assert.equal(payload.to, 'user@example.com')
  assert.match(payload.subject, /restablece/i)
  assert.match(payload.html, /Pepa/)
  assert.match(payload.html, /https:\/\/webrief\.app\/auth\/set-password/)
  assert.match(payload.text, /https:\/\/webrief\.app\/auth\/set-password/)
  assert.ok(payload.from, 'from should be set from getSender()')
})

test('buildResetPasswordEmailPayload: no name fallback', () => {
  const payload = buildResetPasswordEmailPayload({
    to: 'user@example.com',
    fullName: '',
    actionLink: 'https://x/y',
    expiresAt: new Date(),
  })

  assert.match(payload.html, /Hola/)
  assert.doesNotMatch(payload.html, /Hola \w/) // no name appended
})

test('buildResetPasswordEmailPayload: escapes html in name and link', () => {
  const payload = buildResetPasswordEmailPayload({
    to: 'a@b.c',
    fullName: '<script>alert(1)</script>',
    actionLink: 'https://x/y?q=<x>',
    expiresAt: new Date(),
  })

  assert.doesNotMatch(payload.html, /<script>/)
  assert.match(payload.html, /&lt;script&gt;/)
  assert.match(payload.html, /q=&lt;x&gt;/)
})

test('buildResetPasswordEmailPayload: includes expiration hint in spanish', () => {
  const payload = buildResetPasswordEmailPayload({
    to: 'a@b.c',
    fullName: '',
    actionLink: 'https://x/y',
    expiresAt: new Date('2026-05-14T15:30:00Z'),
  })

  // Should mention 1 hour expiration in spanish copy (don't pin exact wording — test that it appears)
  assert.match(payload.text, /1 hora|una hora|expira/i)
})
