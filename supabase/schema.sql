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
  platform_role text not null default 'user' check (platform_role in ('admin', 'user', 'qa')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('manager', 'editor', 'designer', 'developer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  client_name text not null,
  client_email text,
  business_type text not null,
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

alter table public.project_pages add column if not exists content_json jsonb;
alter table public.project_pages add column if not exists version integer not null default 1;
alter table public.project_pages add column if not exists review_status text not null default 'draft';
alter table public.project_pages add column if not exists review_baseline_version_id uuid;
alter table public.project_pages add column if not exists review_baseline_at timestamptz;
alter table public.project_pages add column if not exists review_requested_by uuid references public.profiles(id) on delete set null;
alter table public.project_assets add column if not exists public_url text;

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
alter table public.profiles
  add constraint profiles_platform_role_check
  check (platform_role in ('admin', 'user', 'qa'));

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
