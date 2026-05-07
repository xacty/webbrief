-- Extiende project_comments para soportar threads anclados estilo Google Docs
-- v1: solo equipo interno autenticado. Marks de TipTap se referencian via comment id.

alter table public.project_comments
  add column if not exists parent_comment_id uuid references public.project_comments(id) on delete cascade;

alter table public.project_comments
  add column if not exists anchor_snippet text;

alter table public.project_comments
  add column if not exists mentions uuid[] not null default '{}';

alter table public.project_comments
  add column if not exists resolved_at timestamptz;

alter table public.project_comments
  add column if not exists resolved_by_user_id uuid references public.profiles(id) on delete set null;

alter table public.project_comments
  add column if not exists edited_at timestamptz;

alter table public.project_comments
  add column if not exists deleted_at timestamptz;

alter table public.project_comments
  add column if not exists deleted_by_user_id uuid references public.profiles(id) on delete set null;

create index if not exists project_comments_thread_idx
  on public.project_comments(project_id, page_id, parent_comment_id, resolved_at);

create index if not exists project_comments_parent_idx
  on public.project_comments(parent_comment_id, created_at)
  where parent_comment_id is not null;

create index if not exists project_comments_mentions_idx
  on public.project_comments using gin (mentions);

create index if not exists project_comments_active_root_idx
  on public.project_comments(project_id, page_id, created_at desc)
  where parent_comment_id is null and deleted_at is null;

-- Habilitar replicación lógica para Supabase Realtime sin romper si ya está
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'project_comments'
  ) then
    execute 'alter publication supabase_realtime add table public.project_comments';
  end if;
end
$$;
