-- Biblioteca de imágenes F1: carpetas + extensión de project_assets + cuota por empresa

create table if not exists public.asset_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_folder_id uuid references public.asset_folders(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  trashed_at timestamptz,
  delete_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists asset_folders_company_parent_idx
  on public.asset_folders(company_id, parent_folder_id) where trashed_at is null;

alter table public.asset_folders enable row level security;

drop trigger if exists asset_folders_set_updated_at on public.asset_folders;
create trigger asset_folders_set_updated_at
before update on public.asset_folders
for each row execute function public.set_updated_at();

alter table public.project_assets
  add column if not exists company_id uuid references public.companies(id) on delete cascade,
  add column if not exists folder_id uuid references public.asset_folders(id) on delete set null,
  add column if not exists origin text not null default 'editor',
  add column if not exists source_metadata jsonb;

do $$ begin
  alter table public.project_assets
    add constraint project_assets_origin_check
    check (origin in ('upload','drive','converted','editor'));
exception when duplicate_object then null; end $$;

alter table public.project_assets alter column project_id drop not null;

update public.project_assets a set company_id = p.company_id
  from public.projects p
  where a.project_id = p.id and a.company_id is null;

create index if not exists project_assets_company_idx
  on public.project_assets(company_id, folder_id, created_at desc)
  where trashed_at is null;

alter table public.companies
  add column if not exists storage_quota_mb integer not null default 100;
