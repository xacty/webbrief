import assert from 'node:assert/strict'
import { test } from 'node:test'
import { generateInviteLinkAndSendEmail } from '../src/lib/users.js'

test('generateInviteLinkAndSendEmail: success path returns actionLink + user + emailSent=true', async () => {
  const calls = { generateLink: [], emailSender: [] }
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async (args) => {
          calls.generateLink.push(args)
          return {
            data: {
              properties: { action_link: 'https://example.supabase.co/auth/v1/verify?token=abc&redirect_to=https%3A%2F%2Fwebrief.app%2Fauth%2Fset-password#access_token=xyz&type=invite' },
              user: { id: 'new-user-id', email: 'fresh@example.com', user_metadata: { full_name: 'Fresh User' } },
            },
            error: null,
          }
        },
      },
    },
  }
  const emailSender = async (payload) => {
    calls.emailSender.push(payload)
    return { sent: true, id: 'email-id-123' }
  }

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'fresh@example.com',
    fullName: 'Fresh User',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error, null)
  assert.equal(result.user.id, 'new-user-id')
  assert.equal(result.actionLink.startsWith('https://example.supabase.co/'), true)
  assert.equal(result.emailSent, true)
  assert.equal(calls.generateLink.length, 1)
  assert.equal(calls.generateLink[0].type, 'invite')
  assert.equal(calls.generateLink[0].email, 'fresh@example.com')
  assert.equal(calls.generateLink[0].options.redirectTo, 'https://webrief.app/auth/set-password')
  assert.equal(calls.generateLink[0].options.data.full_name, 'Fresh User')
  assert.equal(calls.emailSender.length, 1)
  assert.equal(calls.emailSender[0].to, 'fresh@example.com')
  assert.equal(calls.emailSender[0].fullName, 'Fresh User')
  assert.equal(calls.emailSender[0].actionLink, result.actionLink)
})

test('generateInviteLinkAndSendEmail: Supabase error returns error and skips email', async () => {
  const calls = { emailSender: [] }
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async () => ({ data: null, error: new Error('Supabase down') }),
      },
    },
  }
  const emailSender = async (payload) => {
    calls.emailSender.push(payload)
    return { sent: true }
  }

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'fresh@example.com',
    fullName: 'Fresh User',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error.message, 'Supabase down')
  assert.equal(result.actionLink, null)
  assert.equal(result.user, null)
  assert.equal(result.emailSent, false)
  assert.equal(calls.emailSender.length, 0)
})

test('generateInviteLinkAndSendEmail: missing action_link in response returns error', async () => {
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async () => ({
          data: { properties: {}, user: { id: 'u1', email: 'x@y.com' } },
          error: null,
        }),
      },
    },
  }
  const emailSender = async () => ({ sent: true })

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'x@y.com',
    fullName: '',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error.message, 'No se pudo generar el link de invitación')
  assert.equal(result.actionLink, null)
  assert.equal(result.emailSent, false)
})

test('generateInviteLinkAndSendEmail: email send failure does not throw, returns emailSent=false', async () => {
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async () => ({
          data: {
            properties: { action_link: 'https://example.supabase.co/auth/v1/verify?type=invite' },
            user: { id: 'u1', email: 'x@y.com', user_metadata: {} },
          },
          error: null,
        }),
      },
    },
  }
  const emailSender = async () => ({ sent: false, reason: 'no_api_key' })

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'x@y.com',
    fullName: '',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error, null)
  assert.equal(result.actionLink.length > 0, true)
  assert.equal(result.user.id, 'u1')
  assert.equal(result.emailSent, false)
})

test('generateInviteLinkAndSendEmail: thrown exception from supabaseClient is caught, returned as error', async () => {
  const calls = { emailSender: [] }
  const supabaseClient = {
    auth: {
      admin: {
        generateLink: async () => {
          throw new Error('Network down')
        },
      },
    },
  }
  const emailSender = async (payload) => {
    calls.emailSender.push(payload)
    return { sent: true }
  }

  const result = await generateInviteLinkAndSendEmail({
    supabaseClient,
    emailSender,
    email: 'x@y.com',
    fullName: '',
    redirectTo: 'https://webrief.app/auth/set-password',
    req: null,
  })

  assert.equal(result.error.message, 'Network down')
  assert.equal(result.actionLink, null)
  assert.equal(result.user, null)
  assert.equal(result.emailSent, false)
  assert.equal(calls.emailSender.length, 0)
})
