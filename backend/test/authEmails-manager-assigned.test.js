import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildManagerAssignedEmailPayload } from '../src/lib/authEmails.js'

test('buildManagerAssignedEmailPayload: minimal shape with name + company + url', () => {
  const payload = buildManagerAssignedEmailPayload({
    to: 'manager@example.com',
    fullName: 'Pepa',
    companyName: 'ACME S.A.',
    addedByLabel: 'Adrián',
    companyUrl: 'https://webrief.app/companies/c-123',
  })

  assert.equal(payload.to, 'manager@example.com')
  assert.match(payload.subject, /manager en ACME/i)
  assert.match(payload.html, /Pepa/)
  assert.match(payload.html, /ACME S\.A\./)
  assert.match(payload.html, /Adrián/)
  assert.match(payload.html, /https:\/\/webrief\.app\/companies\/c-123/)
  assert.match(payload.text, /https:\/\/webrief\.app\/companies\/c-123/)
  assert.ok(payload.from, 'from should be set from getSender()')
})

test('buildManagerAssignedEmailPayload: no name fallback', () => {
  const payload = buildManagerAssignedEmailPayload({
    to: 'a@b.c',
    fullName: '',
    companyName: 'X',
    addedByLabel: 'Admin',
    companyUrl: 'https://x/y',
  })
  assert.match(payload.html, /Hola/)
  assert.doesNotMatch(payload.html, /Hola \w/)
})

test('buildManagerAssignedEmailPayload: escapes html in name + company + url', () => {
  const payload = buildManagerAssignedEmailPayload({
    to: 'a@b.c',
    fullName: '<script>x</script>',
    companyName: '<b>Co</b>',
    addedByLabel: '<x>',
    companyUrl: 'https://x/y?q=<a>',
  })
  assert.doesNotMatch(payload.html, /<script>x<\/script>/)
  assert.match(payload.html, /&lt;script&gt;/)
  assert.match(payload.html, /&lt;b&gt;Co&lt;\/b&gt;/)
  assert.match(payload.html, /q=&lt;a&gt;/)
})

test('buildManagerAssignedEmailPayload: addedBy fallback when label is empty', () => {
  const payload = buildManagerAssignedEmailPayload({
    to: 'a@b.c',
    fullName: 'Pepa',
    companyName: 'ACME',
    addedByLabel: '',
    companyUrl: 'https://x/y',
  })
  // Should mention agregaron/asignaron generically without a name (don't pin exact wording)
  assert.match(payload.text, /agregaron|asignaron|nuevo manager/i)
})
