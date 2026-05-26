-- 20260525_user_sessions_rpcs.sql
-- RPCs to read + revoke Supabase Auth user sessions from the WebRief backend.
--
-- Why RPCs (not direct .from('auth.sessions') queries):
-- the auth schema isn't exposed through PostgREST by default. SECURITY DEFINER
-- RPCs let our service_role queries reach into auth.sessions without granting
-- broad cross-schema access.
--
-- All three functions are restricted to service_role via REVOKE+GRANT
-- (same pattern as 20260506_security_rpc_grants_hardening.sql).
-- anon and authenticated cannot call them through /rest/v1/rpc/*.
--
-- Used by:
-- - GET    /api/users/:id/sessions                      → list_user_sessions
-- - POST   /api/users/:id/sessions/revoke               → revoke_user_sessions
-- - POST   /api/users/:id/sessions/:sessionId/reveal-ip → get_session_ip

BEGIN;

-- 1) List active (non-expired) sessions for a user. Sorted by most-recent activity.
-- refreshed_at is typed `timestamp without time zone` in auth.sessions — we
-- mirror that exactly so PostgREST signature resolution doesn't complain.
CREATE OR REPLACE FUNCTION public.list_user_sessions(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  refreshed_at timestamp,
  user_agent text,
  ip inet,
  not_after timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id, created_at, updated_at, refreshed_at, user_agent, ip, not_after
  FROM auth.sessions
  WHERE user_id = p_user_id
    AND (not_after IS NULL OR not_after > now())
  ORDER BY refreshed_at DESC NULLS LAST, created_at DESC
$$;

REVOKE EXECUTE ON FUNCTION public.list_user_sessions(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_user_sessions(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_sessions(uuid) TO service_role;

-- 2) Revoke (delete) specific sessions of a user. Returns the count actually deleted.
-- The WHERE clause's `user_id = p_user_id AND id = ANY(...)` silently filters out
-- any session IDs that don't belong to this user — no leak, no error.
CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user_id uuid, p_session_ids uuid[])
RETURNS int
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  WITH deleted AS (
    DELETE FROM auth.sessions
    WHERE user_id = p_user_id AND id = ANY(p_session_ids)
    RETURNING 1
  )
  SELECT count(*)::int FROM deleted
$$;

REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_user_sessions(uuid, uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid, uuid[]) TO service_role;

-- 3) Single-session IP fetch for the "reveal IP" UX. Returns NULL (no row) if the
-- session doesn't belong to the user — caller must distinguish from "session has
-- no recorded IP" by checking row presence.
CREATE OR REPLACE FUNCTION public.get_session_ip(p_user_id uuid, p_session_id uuid)
RETURNS TABLE (
  ip inet
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT ip
  FROM auth.sessions
  WHERE user_id = p_user_id AND id = p_session_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_session_ip(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_session_ip(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_ip(uuid, uuid) TO service_role;

COMMIT;
