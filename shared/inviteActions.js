// Maps ensureUserProfile's decision action to the security_events action name.
export const INVITE_ACTION_TO_EVENT = {
  invited: 'invite_sent',
  reinvited: 'invite_resent',
  assigned_existing: 'invite_skipped_existing_user',
}

export function toInviteSecurityAction(decisionAction) {
  return INVITE_ACTION_TO_EVENT[decisionAction] || 'invite_sent'
}

// Build a user-facing Spanish message for the invite outcome, distinguishing
// between fresh invite, re-invite with successful email, re-invite where the
// email send failed (so the admin knows to follow up), and skipping (existing
// active user assigned without invite).
export function buildInviteResultMessage({ action, inviteSent }) {
  if (action === 'invited') {
    return inviteSent ? 'Invitación enviada' : 'Usuario creado (no se pudo enviar el correo)'
  }
  if (action === 'reinvited') {
    return inviteSent
      ? 'Invitación reenviada'
      : 'Invitación regenerada (no se pudo enviar el correo)'
  }
  if (action === 'assigned_existing') {
    return 'Acceso agregado'
  }
  return inviteSent ? 'Invitación enviada' : 'Usuario asignado'
}
