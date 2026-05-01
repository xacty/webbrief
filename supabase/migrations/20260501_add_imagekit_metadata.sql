alter table public.project_assets
  add column if not exists imagekit_file_id text;

alter table public.profiles
  add column if not exists avatar_original_url text,
  add column if not exists avatar_file_id text,
  add column if not exists avatar_file_name text,
  add column if not exists avatar_file_path text;
