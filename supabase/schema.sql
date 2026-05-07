create extension if not exists pgcrypto;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  is_test boolean not null default false,
  created_for_testing_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid,
  trashed_at timestamptz,
  delete_after timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  avatar_url text,
  avatar_original_url text,
  avatar_file_id text,
  avatar_file_name text,
  avatar_file_path text,
  platform_role text not null default 'user' check (platform_role in ('admin', 'user', 'qa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('manager', 'editor', 'content_writer', 'designer', 'developer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  client_name text,
  client_email text,
  business_type text not null,
  project_type text not null default 'page' check (project_type in ('page', 'document', 'faq', 'brief')),
  created_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  trashed_at timestamptz,
  delete_after timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  position integer not null,
  content_html text not null default '<p></p>',
  content_json jsonb,
  seo_metadata jsonb not null default '{}'::jsonb,
  content_rules jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  review_status text not null default 'draft' check (review_status in ('draft', 'ready_for_review', 'approved', 'changes_requested')),
  review_baseline_version_id uuid,
  review_baseline_at timestamptz,
  review_requested_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, position)
);

create table if not exists public.project_page_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  page_id uuid not null references public.project_pages(id) on delete cascade,
  version_name text not null,
  source text not null default 'review_baseline' check (source in ('review_baseline', 'manual_named_version', 'restore')),
  content_html text not null default '<p></p>',
  content_json jsonb,
  sections_snapshot jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.project_page_change_proposals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  page_id uuid not null references public.project_pages(id) on delete cascade,
  proposer_user_id uuid references public.profiles(id) on delete set null,
  content_html text not null default '<p></p>',
  content_json jsonb,
  seo_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewer_user_id uuid references public.profiles(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_activity (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_label text not null,
  event_type text not null,
  subject_type text,
  subject_id uuid,
  title text not null,
  description text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_deliverables (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  service_type text not null default 'otro',
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'review', 'approved', 'blocked')),
  assignee_id uuid references public.profiles(id) on delete set null,
  linked_page_id uuid references public.project_pages(id) on delete set null,
  linked_section_id text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  trashed_at timestamptz,
  delete_after timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  page_id uuid references public.project_pages(id) on delete set null,
  section_id text,
  actor_user_id uuid references public.profiles(id) on delete set null,
  author_name text not null,
  author_email text not null,
  body text not null,
  source text not null default 'app' check (source in ('app', 'share')),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_approvals (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  page_id uuid references public.project_pages(id) on delete set null,
  section_id text,
  reviewer_name text not null,
  reviewer_email text not null,
  status text not null check (status in ('approved', 'changes_requested')),
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_share_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'Link privado',
  created_by uuid references public.profiles(id) on delete set null,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  deliverable_id uuid references public.project_deliverables(id) on delete set null,
  page_id uuid references public.project_pages(id) on delete set null,
  section_id text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  file_name text not null,
  storage_bucket text not null,
  storage_path text not null,
  imagekit_file_id text,
  mime_type text not null,
  asset_kind text not null check (asset_kind in ('image', 'svg', 'file')),
  public_url text,
  file_size integer not null,
  width integer,
  height integer,
  render_inline boolean not null default false,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete set null,
  trashed_at timestamptz,
  delete_after timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  actor_role text,
  ip_address text,
  user_agent text,
  request_id text,
  action text not null,
  resource_type text not null,
  resource_id text,
  company_id uuid references public.companies(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  outcome text not null default 'success' check (outcome in ('success', 'denied', 'failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limit_buckets (
  key text primary key,
  count integer not null default 0,
  reset_at timestamptz not null,
  blocked_until timestamptz,
  violations integer not null default 0,
  violation_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

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

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.companies add column if not exists archived_at timestamptz;
alter table public.companies add column if not exists archived_by uuid;
alter table public.companies add column if not exists trashed_at timestamptz;
alter table public.companies add column if not exists delete_after timestamptz;
alter table public.companies add column if not exists deleted_by uuid;
alter table public.companies add column if not exists is_test boolean not null default false;
alter table public.companies add column if not exists created_for_testing_by uuid;

alter table public.projects add column if not exists archived_at timestamptz;
alter table public.projects add column if not exists archived_by uuid references public.profiles(id) on delete set null;
alter table public.projects add column if not exists trashed_at timestamptz;
alter table public.projects add column if not exists delete_after timestamptz;
alter table public.projects add column if not exists deleted_by uuid references public.profiles(id) on delete set null;
alter table public.projects add column if not exists project_type text not null default 'page';
alter table public.projects alter column client_name drop not null;
update public.projects set project_type = 'page' where project_type is null;

alter table public.project_pages add column if not exists content_json jsonb;
alter table public.project_pages add column if not exists seo_metadata jsonb not null default '{}'::jsonb;
alter table public.project_pages add column if not exists content_rules jsonb not null default '{}'::jsonb;
alter table public.project_pages add column if not exists version integer not null default 1;
alter table public.project_pages add column if not exists review_status text not null default 'draft';
alter table public.project_pages add column if not exists review_baseline_version_id uuid;
alter table public.project_pages add column if not exists review_baseline_at timestamptz;
alter table public.project_pages add column if not exists review_requested_by uuid references public.profiles(id) on delete set null;
alter table public.project_assets add column if not exists public_url text;
alter table public.project_assets add column if not exists imagekit_file_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_archived_by_fkey') then
    alter table public.companies
      add constraint companies_archived_by_fkey
      foreign key (archived_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'companies_deleted_by_fkey') then
    alter table public.companies
      add constraint companies_deleted_by_fkey
      foreign key (deleted_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'companies_created_for_testing_by_fkey') then
    alter table public.companies
      add constraint companies_created_for_testing_by_fkey
      foreign key (created_for_testing_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'projects_archived_by_fkey') then
    alter table public.projects
      add constraint projects_archived_by_fkey
      foreign key (archived_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'projects_deleted_by_fkey') then
    alter table public.projects
      add constraint projects_deleted_by_fkey
      foreign key (deleted_by) references public.profiles(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'project_pages_review_status_check') then
    alter table public.project_pages
      add constraint project_pages_review_status_check
      check (review_status in ('draft', 'ready_for_review', 'approved', 'changes_requested'));
  end if;
end;
$$;

alter table public.profiles drop constraint if exists profiles_platform_role_check;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists avatar_original_url text;
alter table public.profiles add column if not exists avatar_file_id text;
alter table public.profiles add column if not exists avatar_file_name text;
alter table public.profiles add column if not exists avatar_file_path text;
alter table public.profiles
  add constraint profiles_platform_role_check
  check (platform_role in ('admin', 'user', 'qa'));

alter table public.company_memberships drop constraint if exists company_memberships_role_check;
alter table public.company_memberships
  add constraint company_memberships_role_check
  check (role in ('manager', 'editor', 'content_writer', 'designer', 'developer'));

drop trigger if exists companies_set_updated_at on public.companies;
create trigger companies_set_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists company_memberships_set_updated_at on public.company_memberships;
create trigger company_memberships_set_updated_at
before update on public.company_memberships
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists project_pages_set_updated_at on public.project_pages;
create trigger project_pages_set_updated_at
before update on public.project_pages
for each row execute function public.set_updated_at();

drop trigger if exists project_deliverables_set_updated_at on public.project_deliverables;
create trigger project_deliverables_set_updated_at
before update on public.project_deliverables
for each row execute function public.set_updated_at();

drop trigger if exists project_comments_set_updated_at on public.project_comments;
create trigger project_comments_set_updated_at
before update on public.project_comments
for each row execute function public.set_updated_at();

drop trigger if exists project_assets_set_updated_at on public.project_assets;
create trigger project_assets_set_updated_at
before update on public.project_assets
for each row execute function public.set_updated_at();

create index if not exists project_activity_project_created_idx on public.project_activity(project_id, created_at desc);
create index if not exists project_activity_section_review_idx on public.project_activity(project_id, actor_user_id, event_type, created_at desc);
create index if not exists project_page_versions_page_created_idx on public.project_page_versions(page_id, created_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists companies_active_name_idx on public.companies(name) where archived_at is null and trashed_at is null;
create index if not exists companies_test_created_idx on public.companies(created_at desc) where is_test = true;
create index if not exists projects_company_active_updated_idx on public.projects(company_id, updated_at desc) where archived_at is null and trashed_at is null;
create index if not exists project_deliverables_project_idx on public.project_deliverables(project_id, updated_at desc) where trashed_at is null;
create index if not exists project_comments_project_idx on public.project_comments(project_id, created_at desc);
create index if not exists project_approvals_project_idx on public.project_approvals(project_id, created_at desc);
create index if not exists project_assets_project_idx on public.project_assets(project_id, created_at desc) where trashed_at is null;
create index if not exists security_events_created_idx on public.security_events(created_at desc);
create index if not exists security_events_actor_created_idx on public.security_events(actor_user_id, created_at desc);
create index if not exists security_events_company_created_idx on public.security_events(company_id, created_at desc);
create index if not exists security_events_project_created_idx on public.security_events(project_id, created_at desc);
create index if not exists security_events_action_created_idx on public.security_events(action, created_at desc);
create index if not exists security_events_request_id_idx on public.security_events(request_id) where request_id is not null;
create index if not exists rate_limit_buckets_updated_idx on public.rate_limit_buckets(updated_at);
create index if not exists security_blocks_active_user_idx on public.security_blocks(user_id, blocked_at desc) where revoked_at is null and block_type = 'user';
create index if not exists security_blocks_active_ip_idx on public.security_blocks(ip_address, blocked_at desc) where revoked_at is null and block_type = 'ip';
create index if not exists security_blocks_created_idx on public.security_blocks(blocked_at desc);

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_memberships enable row level security;
alter table public.projects enable row level security;
alter table public.project_pages enable row level security;
alter table public.project_page_versions enable row level security;
alter table public.project_activity enable row level security;
alter table public.notifications enable row level security;
alter table public.project_deliverables enable row level security;
alter table public.project_comments enable row level security;
alter table public.project_approvals enable row level security;
alter table public.project_share_links enable row level security;
alter table public.project_assets enable row level security;
alter table public.security_events enable row level security;
alter table public.rate_limit_buckets enable row level security;
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
      key, count, reset_at, blocked_until, violations, violation_expires_at, updated_at
    ) values (
      p_key, v_count, v_reset_at, v_blocked_until, v_violations, v_violation_expires_at, v_now
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
    key, count, reset_at, blocked_until, violations, violation_expires_at, updated_at
  ) values (
    p_key, v_count, v_reset_at, null, v_violations, v_violation_expires_at, v_now
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-assets',
  'project-assets',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = now();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types,
    updated_at = now();
