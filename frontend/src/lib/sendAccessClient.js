// Shared client wrapper for POST /api/users/:id/send-access.
// Extracted from UsersPage.handleSendAccess so CompanyPage can reuse the
// EXACT same wire format (Bearer token via supabase session, raw fetch
// instead of apiFetch because we need to read Retry-After header on 429).
//
// Returns a normalized result object the caller can map to UI feedback.

import { supabase } from './supabase'

export async function sendAccess(targetUser) {
  if (!targetUser?.id) {
    return { ok: false, kind: 'invalid', message: 'Usuario inválido' }
  }

  let session
  try {
    const result = await supabase.auth.getSession()
    session = result?.data?.session
  } catch (err) {
    return { ok: false, kind: 'network', message: err?.message || 'Sesión no disponible' }
  }

  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  let response
  try {
    response = await fetch(`/api/users/${targetUser.id}/send-access`, {
      method: 'POST',
      headers,
    })
  } catch (err) {
    return { ok: false, kind: 'network', message: err?.message || 'Error de red enviando acceso' }
  }

  if (response.status === 429) {
    const retryAfterHeader = response.headers.get('Retry-After')
    const seconds = Number(retryAfterHeader) || 900
    const minutes = Math.max(1, Math.ceil(seconds / 60))
    return {
      ok: false,
      kind: 'rate_limited',
      message: `Demasiados intentos. Esperá ~${minutes} minutos.`,
    }
  }

  const body = await response.json().catch(() => ({}))

  if (!response.ok) {
    const idHint = body.errorId ? ` (ID: ${body.errorId})` : ''
    return {
      ok: false,
      kind: 'server',
      message: body.error ? `${body.error}${idHint}` : `No se pudo enviar acceso${idHint}`,
    }
  }

  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null
  const expiresLabel = expiresAt
    ? expiresAt.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    : ''
  const actionLabel = body.action === 'invite_resent' ? 'Invitación reenviada' : 'Email de restablecimiento enviado'
  const tail = body.emailSent ? `, caduca ${expiresLabel}` : ' (link generado, email no entregado)'

  return {
    ok: true,
    kind: 'sent',
    action: body.action,
    emailSent: Boolean(body.emailSent),
    expiresAt,
    message: `${actionLabel}${tail}`,
  }
}
