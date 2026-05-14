// Auth-flow emails sent directly via Resend REST.
//
// Used when we need to send an invite/recovery link from outside
// Supabase's native inviteUserByEmail flow — i.e., when the auth
// user already exists and we use admin.generateLink() to mint a
// new link without auto-emailing.
//
// Env:
//   RESEND_API_KEY      — required for real sends; functions are
//                         no-ops if missing (logs warning)
//   AUTH_EMAIL_FROM     — e.g. "WeBrief <no-reply@webrief.app>"
//                         falls back to COMMENTS_EMAIL_FROM, then
//                         a hard-coded default.

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

function getSender() {
  return (
    process.env.AUTH_EMAIL_FROM
    || process.env.COMMENTS_EMAIL_FROM
    || 'WeBrief <no-reply@webrief.app>'
  )
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildInviteEmailPayload({ to, fullName, actionLink, companyName }) {
  const safeName = fullName?.trim() || ''
  const greeting = safeName ? `Hola ${safeName}` : 'Hola'
  const companyClause = companyName ? ` en ${companyName}` : ''
  const subject = companyName
    ? `Te invitaron a WeBrief${companyClause}`
    : `Te invitaron a WeBrief`

  const html = `
    <!doctype html>
    <html lang="es"><head><meta charset="utf-8"></head><body style="font-family:system-ui,-apple-system,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(greeting)}</h1>
      <p style="font-size:15px;line-height:1.5;margin:0 0 16px">
        Recibiste una invitación para acceder a WeBrief${escapeHtml(companyClause)}.
        Hacé clic en el botón para crear tu contraseña y entrar.
      </p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(actionLink)}"
           style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
          Crear mi contraseña
        </a>
      </p>
      <p style="font-size:13px;color:#666;margin:24px 0 0">
        Si el botón no funciona, copiá esta dirección en tu navegador:<br>
        <span style="word-break:break-all">${escapeHtml(actionLink)}</span>
      </p>
      <p style="font-size:12px;color:#888;margin:24px 0 0">
        Si no esperabas esta invitación, ignorá este mensaje.
      </p>
    </body></html>
  `.trim()

  const text = [
    greeting + '.',
    '',
    `Recibiste una invitación para acceder a WeBrief${companyClause}.`,
    'Abrí el siguiente enlace para crear tu contraseña:',
    actionLink,
    '',
    'Si no esperabas esta invitación, ignorá este mensaje.',
  ].join('\n')

  return { to, subject, html, text, from: getSender() }
}

export async function sendInviteEmail(args) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('[authEmails] RESEND_API_KEY missing; skipping invite email send')
    return { sent: false, reason: 'no_api_key' }
  }

  const payload = buildInviteEmailPayload(args)

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: payload.from,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.warn('[authEmails] Resend send failed', response.status, errorBody)
      return { sent: false, reason: `resend_${response.status}`, errorBody }
    }

    const data = await response.json().catch(() => null)
    return { sent: true, id: data?.id || null }
  } catch (error) {
    console.warn('[authEmails] Resend send threw', error?.message)
    return { sent: false, reason: 'exception', errorMessage: error?.message }
  }
}
