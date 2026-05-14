-- application_errors: technical/operator diagnostics, separate from
-- security_events (which is the security audit trail).
--
-- Retention: 90 days recommended. Truncation handled out-of-band.

CREATE TABLE IF NOT EXISTS application_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  level text NOT NULL CHECK (level IN ('error', 'warn')),
  source text NOT NULL,            -- 'supabase_auth' | 'route' | 'external_api' | 'unhandled' | 'email'
  request_id text,
  route text,                       -- e.g. '/api/users'
  method text,                      -- 'POST', 'GET', etc.
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  error_code text,                  -- e.g. 'over_email_send_rate_limit', 'EUNHANDLED'
  error_message text NOT NULL,
  stack_trace text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_application_errors_created
  ON application_errors (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_application_errors_level_source
  ON application_errors (level, source);

CREATE INDEX IF NOT EXISTS idx_application_errors_request
  ON application_errors (request_id);

-- RLS: deny all (admin reads happen via service_role; no end-user access).
ALTER TABLE application_errors ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE application_errors IS
  'Technical errors and warnings for operator diagnostics. Distinct from security_events (audit trail).';
