create table if not exists public.security_blocks (
  id uuid primary key default gen_random_uuid(),
  block_type text not null check (block_type in ('user', 'ip')),
  user_id uuid references public.profiles(id) on delete cascade,
  ip_address text,
  reason text not null,
  blocked_by uuid references public.profiles(id) on delete set null,
  blocked_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (
    (block_type = 'user' and user_id is not null and ip_address is null)
    or
    (block_type = 'ip' and ip_address is not null and user_id is null)
  )
);

create index if not exists security_blocks_active_user_idx
  on public.security_blocks(user_id, blocked_at desc)
  where revoked_at is null and block_type = 'user';

create index if not exists security_blocks_active_ip_idx
  on public.security_blocks(ip_address, blocked_at desc)
  where revoked_at is null and block_type = 'ip';

create index if not exists security_blocks_created_idx
  on public.security_blocks(blocked_at desc);

alter table public.security_blocks enable row level security;

create or replace function public.get_auth_audit_events(
  p_since timestamptz default now() - interval '7 days',
  p_limit integer default 100,
  p_offset integer default 0
) returns table (
  id text,
  created_at timestamptz,
  action text,
  outcome text,
  actor_user_id uuid,
  actor_email text,
  ip_address text,
  user_agent text,
  metadata jsonb
)
language sql
security definer
set search_path = public, auth
as $$
  select
    a.id::text,
    a.created_at,
    coalesce(
      a.payload::jsonb ->> 'action',
      a.payload::jsonb ->> 'event',
      a.payload::jsonb ->> 'type',
      'auth_event'
    ) as action,
    case
      when lower(coalesce(a.payload::jsonb ->> 'status', '')) in ('error', 'failed', 'denied') then 'failed'
      when a.payload::jsonb ? 'error' then 'failed'
      else 'success'
    end as outcome,
    case
      when coalesce(a.payload::jsonb ->> 'actor_id', a.payload::jsonb ->> 'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then coalesce(a.payload::jsonb ->> 'actor_id', a.payload::jsonb ->> 'user_id')::uuid
      else null
    end as actor_user_id,
    coalesce(
      a.payload::jsonb ->> 'actor_username',
      a.payload::jsonb ->> 'email',
      a.payload::jsonb #>> '{traits,email}',
      a.payload::jsonb #>> '{metadata,email}'
    ) as actor_email,
    coalesce(
      a.ip_address::text,
      a.payload::jsonb ->> 'ip_address',
      a.payload::jsonb #>> '{metadata,ip_address}'
    ) as ip_address,
    coalesce(
      a.payload::jsonb ->> 'user_agent',
      a.payload::jsonb #>> '{metadata,user_agent}'
    ) as user_agent,
    a.payload::jsonb - 'token' - 'access_token' - 'password' - 'authorization' as metadata
  from auth.audit_log_entries a
  where a.created_at >= p_since
  order by a.created_at desc
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
$$;
