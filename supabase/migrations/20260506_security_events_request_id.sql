alter table public.security_events
  add column if not exists request_id text;

create index if not exists security_events_request_id_idx
  on public.security_events(request_id)
  where request_id is not null;
