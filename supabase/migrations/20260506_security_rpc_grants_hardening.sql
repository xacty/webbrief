-- Restrict consume_rate_limit and get_auth_audit_events to backend (service_role) only.
-- Both are SECURITY DEFINER and were created with the default Postgres ACL,
-- which grants EXECUTE to PUBLIC (and through Supabase config, to anon/authenticated).
-- That means anyone with the anon key could call /rest/v1/rpc/consume_rate_limit
-- or /rest/v1/rpc/get_auth_audit_events, bypassing the WeBrief Express layer.
-- Backend uses service_role, so revoking from anon/authenticated/public has no effect on it.

revoke execute on function public.consume_rate_limit(text, integer, integer, integer, integer, integer, boolean) from public;
revoke execute on function public.consume_rate_limit(text, integer, integer, integer, integer, integer, boolean) from anon;
revoke execute on function public.consume_rate_limit(text, integer, integer, integer, integer, integer, boolean) from authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer, integer, integer, integer, boolean) to service_role;

revoke execute on function public.get_auth_audit_events(timestamptz, integer, integer) from public;
revoke execute on function public.get_auth_audit_events(timestamptz, integer, integer) from anon;
revoke execute on function public.get_auth_audit_events(timestamptz, integer, integer) from authenticated;
grant execute on function public.get_auth_audit_events(timestamptz, integer, integer) to service_role;
