-- Organización de proyectos (Ola 2 / O2.b): carpetas de proyectos.
-- A diferencia de asset_folders (biblioteca), esta tabla NO tiene papelera:
-- borrar una carpeta de proyectos jamás toca los proyectos ni las
-- subcarpetas que contiene — se reparentan a la carpeta padre de la
-- borrada (o a la raíz si no tenía padre). Ver planFolderDeletion en
-- backend/src/lib/folderTree.js para la semántica exacta que ejecuta el
-- endpoint DELETE antes de borrar la fila.

create table if not exists public.project_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_folder_id uuid references public.project_folders(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- parent_folder_id es ON DELETE CASCADE a nivel de FK (mismo patrón que
-- asset_folders) pero el endpoint DELETE reparenta subcarpetas y proyectos
-- ANTES de borrar la fila, así que el cascade nunca debería ejercitarse en
-- el flujo normal de la app; queda como red de seguridad de integridad.
create index if not exists project_folders_company_parent_idx
  on public.project_folders(company_id, parent_folder_id);

alter table public.project_folders enable row level security;

drop trigger if exists project_folders_set_updated_at on public.project_folders;
create trigger project_folders_set_updated_at
before update on public.project_folders
for each row execute function public.set_updated_at();

alter table public.projects
  add column if not exists folder_id uuid references public.project_folders(id) on delete set null;

create index if not exists projects_folder_id_idx
  on public.projects(folder_id) where folder_id is not null;
