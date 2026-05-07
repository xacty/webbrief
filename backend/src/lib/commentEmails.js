// Envía emails transaccionales de comentarios vía API REST de Resend.
// No requiere instalar el SDK; usa fetch nativo. Si falta config, no-opea.
//
// Env vars:
//   RESEND_API_KEY        — clave de API de Resend (https://resend.com/api-keys)
//   COMMENTS_EMAIL_FROM   — opcional; default 'WeBrief <noreply@webrief.app>'
//   FRONTEND_URL          — base del frontend para CTA links (ya usado para invites)

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

function buildSubject({ eventType, actorName, projectName }) {
  if (eventType === 'comment_mention') {
    return `${actorName} te mencionó en ${projectName}`
  }
  if (eventType === 'comment_reply') {
    return `${actorName} respondió tu comentario en ${projectName}`
  }
  return `Actividad de comentarios en ${projectName}`
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildHtml({ recipientName, actorName, projectName, body, ctaUrl }) {
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;background:#f5f5f5;font-family:'Segoe UI',Roboto,system-ui,sans-serif;color:#212222">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 16px">
      <tr><td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
          <tr><td style="padding:28px 32px 16px">
            <div style="font-size:14px;color:#6b7280;margin-bottom:8px">WeBrief</div>
            <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;color:#212222">Hola ${escapeHtml(recipientName)},</h1>
            <p style="font-size:15px;line-height:1.6;margin:0 0 16px">
              <strong>${escapeHtml(actorName)}</strong> dejó un comentario en <strong>${escapeHtml(projectName)}</strong>:
            </p>
            <blockquote style="margin:0 0 24px;padding:12px 16px;background:#f9fafb;border-left:3px solid #f59e0b;color:#4b5563;font-size:14px;line-height:1.5;white-space:pre-wrap">${escapeHtml(body)}</blockquote>
            <div style="text-align:center;margin:24px 0">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#0088ff;color:#ffffff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Ver en WeBrief</a>
            </div>
            <p style="font-size:12px;color:#9ca3af;margin:24px 0 0;text-align:center">
              Recibís este email porque sos miembro del proyecto en WeBrief.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

function buildText({ recipientName, actorName, projectName, body, ctaUrl }) {
  return [
    `Hola ${recipientName},`,
    '',
    `${actorName} dejó un comentario en ${projectName}:`,
    '',
    body,
    '',
    `Ver en WeBrief: ${ctaUrl}`,
  ].join('\n')
}

export async function sendCommentEmail({
  to,
  recipientName,
  actorName,
  projectName,
  projectId,
  commentId,
  rootCommentId,
  body,
  eventType,
}) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    return { sent: false, reason: 'missing_api_key' }
  }
  if (!to) {
    return { sent: false, reason: 'missing_recipient' }
  }

  const fromAddress = process.env.COMMENTS_EMAIL_FROM || 'WeBrief <noreply@webrief.app>'
  const frontendBase = (process.env.FRONTEND_URL || 'https://webrief.app').replace(/\/$/, '')
  const focusId = rootCommentId || commentId
  const ctaUrl = `${frontendBase}/project/${projectId}/editor?commentId=${focusId}`

  const subject = buildSubject({ eventType, actorName, projectName })
  const html = buildHtml({ recipientName, actorName, projectName, body, ctaUrl })
  const text = buildText({ recipientName, actorName, projectName, body, ctaUrl })

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to,
        subject,
        html,
        text,
      }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      return { sent: false, reason: `resend_${response.status}`, errorBody }
    }

    const json = await response.json().catch(() => ({}))
    return { sent: true, id: json.id }
  } catch (error) {
    return { sent: false, reason: 'fetch_failed', message: error.message }
  }
}
