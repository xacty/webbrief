alter table public.project_pages
  add column if not exists content_rules jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
