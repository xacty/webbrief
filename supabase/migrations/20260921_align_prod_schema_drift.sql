-- Alinea Prod con Dev (derivas detectadas en el simulacro de backups del 2026-09-21).
-- Idempotente: en Dev no cambia nada.
--
-- 1. projects.project_type: backfill con el mismo criterio que inferProjectType
--    (backend/src/routes/companies.js) y luego DEFAULT 'page' + NOT NULL + CHECK.
-- 2. projects.client_name: se permite NULL (el backend guarda NULL al vaciar el
--    cliente en PATCH /projects/:id; con NOT NULL fallaría en Prod).
-- 3. project_templates.company_id: NOT NULL (como en 20260504_add_brief_and_templates).
-- 4. project_templates.created_by: FK a profiles con ON DELETE SET NULL.

begin;

update public.projects p
set project_type = case
  when lower(trim(coalesce(fp.name, ''))) = 'documento' then 'document'
  when lower(trim(coalesce(fp.name, ''))) in ('faq', 'faqs', 'preguntas frecuentes') then 'faq'
  when jsonb_typeof(fp.content_json -> 'questions') = 'array' then 'brief'
  else 'page'
end
from public.projects p2
left join lateral (
  select pp.name, pp.content_json
  from public.project_pages pp
  where pp.project_id = p2.id
  order by pp.position
  limit 1
) fp on true
where p.id = p2.id
  and p.project_type is null;

update public.projects
set project_type = 'page'
where project_type not in ('page', 'document', 'faq', 'brief');

alter table public.projects alter column project_type set default 'page';
alter table public.projects alter column project_type set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_project_type_check'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_project_type_check
      check (project_type in ('page', 'document', 'faq', 'brief'));
  end if;
end $$;

alter table public.projects alter column client_name drop not null;

alter table public.project_templates alter column company_id set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'project_templates_created_by_fkey'
      and conrelid = 'public.project_templates'::regclass
  ) then
    alter table public.project_templates
      add constraint project_templates_created_by_fkey
      foreign key (created_by) references public.profiles(id) on delete set null;
  end if;
end $$;

commit;
