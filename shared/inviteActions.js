// Maps ensureUserProfile's decision action to the security_events action name.
export const INVITE_ACTION_TO_EVENT = {
  invited: 'invite_sent',
  reinvited: 'invite_resent',
  assigned_existing: 'invite_skipped_existing_user',
}

export function toInviteSecurityAction(decisionAction) {
  return INVITE_ACTION_TO_EVENT[decisionAction] || 'invite_sent'
}
