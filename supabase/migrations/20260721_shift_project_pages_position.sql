-- 20260721 — shift_project_pages_position(project_id, offset)
--
-- Adds atomic per-project positional shift so PUT /api/projects/:id/pages can
-- reorder existing pages without hitting the (project_id, position) unique
-- constraint during the subsequent upsert. UPDATE in a single statement is
-- atomic and defers uniqueness checks until statement end, so bulk-shifting
-- every existing row's position by a large offset is safe. The upsert that
-- follows overwrites those positions with the final values from the payload.
--
-- Safe to re-run: CREATE OR REPLACE.
--
-- Callable via PostgREST from the service_role only (matches every other
-- WeBrief RPC — the anon/authenticated keys never touch RPCs).

create or replace function public.shift_project_pages_position(
  p_project_id uuid,
  p_offset integer
) returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  update project_pages
     set position = position + p_offset
   where project_id = p_project_id;
  select coalesce(
    (select count(*)::int from project_pages where project_id = p_project_id),
    0
  );
$$;

revoke all on function public.shift_project_pages_position(uuid, integer) from public;
revoke all on function public.shift_project_pages_position(uuid, integer) from anon;
revoke all on function public.shift_project_pages_position(uuid, integer) from authenticated;
grant execute on function public.shift_project_pages_position(uuid, integer) to service_role;
