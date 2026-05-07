create table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  blocked_until timestamptz,
  violations integer not null default 0,
  violation_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists rate_limit_buckets_updated_idx
  on public.rate_limit_buckets(updated_at);

create or replace function public.consume_rate_limit(
  p_key text,
  p_window_ms integer,
  p_max integer,
  p_block_ms integer,
  p_max_block_ms integer,
  p_violation_ttl_ms integer,
  p_progressive boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer := 0;
  v_reset_at timestamptz := v_now + (p_window_ms * interval '1 millisecond');
  v_blocked_until timestamptz;
  v_violations integer := 0;
  v_violation_expires_at timestamptz;
  v_multiplier integer := 1;
  v_next_block_ms integer := p_block_ms;
  v_retry_after integer := 0;
  v_existing record;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));

  select *
  into v_existing
  from public.rate_limit_buckets
  where key = p_key;

  if found then
    if v_existing.reset_at > v_now then
      v_count := v_existing.count;
      v_reset_at := v_existing.reset_at;
    end if;

    v_blocked_until := v_existing.blocked_until;

    if v_existing.violation_expires_at > v_now then
      v_violations := v_existing.violations;
      v_violation_expires_at := v_existing.violation_expires_at;
    end if;
  end if;

  if v_blocked_until is not null and v_blocked_until > v_now then
    v_retry_after := ceil(extract(epoch from (v_blocked_until - v_now)));

    return jsonb_build_object(
      'blocked', true,
      'alreadyBlocked', true,
      'retryAfterSeconds', v_retry_after,
      'count', v_count,
      'resetAtMs', floor(extract(epoch from v_reset_at) * 1000),
      'violations', v_violations
    );
  end if;

  v_count := v_count + 1;

  if v_count > p_max then
    if p_progressive then
      v_violations := v_violations + 1;
    else
      v_violations := 1;
    end if;

    v_violation_expires_at := v_now + (p_violation_ttl_ms * interval '1 millisecond');
    v_multiplier := case
      when p_progressive then least((power(2, greatest(v_violations - 1, 0)))::integer, 16)
      else 1
    end;
    v_next_block_ms := least(p_block_ms * v_multiplier, p_max_block_ms);
    v_blocked_until := v_now + (v_next_block_ms * interval '1 millisecond');
    v_retry_after := ceil(extract(epoch from (v_blocked_until - v_now)));

    insert into public.rate_limit_buckets (
      key,
      count,
      reset_at,
      blocked_until,
      violations,
      violation_expires_at,
      updated_at
    ) values (
      p_key,
      v_count,
      v_reset_at,
      v_blocked_until,
      v_violations,
      v_violation_expires_at,
      v_now
    )
    on conflict (key) do update set
      count = excluded.count,
      reset_at = excluded.reset_at,
      blocked_until = excluded.blocked_until,
      violations = excluded.violations,
      violation_expires_at = excluded.violation_expires_at,
      updated_at = excluded.updated_at;

    return jsonb_build_object(
      'blocked', true,
      'retryAfterSeconds', v_retry_after,
      'count', v_count,
      'resetAtMs', floor(extract(epoch from v_reset_at) * 1000),
      'violations', v_violations,
      'blockMs', v_next_block_ms
    );
  end if;

  insert into public.rate_limit_buckets (
    key,
    count,
    reset_at,
    blocked_until,
    violations,
    violation_expires_at,
    updated_at
  ) values (
    p_key,
    v_count,
    v_reset_at,
    null,
    v_violations,
    v_violation_expires_at,
    v_now
  )
  on conflict (key) do update set
    count = excluded.count,
    reset_at = excluded.reset_at,
    blocked_until = excluded.blocked_until,
    violations = excluded.violations,
    violation_expires_at = excluded.violation_expires_at,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'blocked', false,
    'count', v_count,
    'resetAtMs', floor(extract(epoch from v_reset_at) * 1000),
    'violations', v_violations
  );
end;
$$;

alter table public.rate_limit_buckets enable row level security;
