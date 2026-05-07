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

create index if not exists security_events_created_idx
  on public.security_events(created_at desc);

create index if not exists security_events_actor_created_idx
  on public.security_events(actor_user_id, created_at desc);

create index if not exists security_events_company_created_idx
  on public.security_events(company_id, created_at desc);

create index if not exists security_events_project_created_idx
  on public.security_events(project_id, created_at desc);

create index if not exists security_events_action_created_idx
  on public.security_events(action, created_at desc);

create index if not exists security_events_request_id_idx
  on public.security_events(request_id)
  where request_id is not null;

alter table public.security_events enable row level security;
