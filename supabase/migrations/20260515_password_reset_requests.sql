-- password_reset_requests: server-side 1h TTL enforcement for recovery links.
--
-- Supabase Auth's global email_otp_exp is 24h (aligned with invite TTL).
-- Recovery links should be shorter; we enforce that by inserting a row here
-- when /api/users/:id/send-access fires for an active user, and checking
-- expires_at when the frontend hits /api/auth/validate-reset-token.
--
-- The row is also marked used_at on successful password update so that a
-- recovery link can only be consumed once.

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  ip_address text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_user_recent
  ON password_reset_requests (user_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_password_reset_requests_active
  ON password_reset_requests (user_id, expires_at)
  WHERE used_at IS NULL;

-- RLS: deny all (admin reads happen via service_role; no end-user access).
ALTER TABLE password_reset_requests ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE password_reset_requests IS
  'Server-side TTL ledger for password recovery links (1h enforced on top of Supabase global 24h).';
