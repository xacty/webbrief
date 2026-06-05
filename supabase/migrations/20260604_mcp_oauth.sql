-- 20260604_mcp_oauth.sql
-- OAuth 2.1 + PKCE + DCR support for MCP authorization (per spec 2025-11-25).
-- All tables are service-role-only (RLS enabled, no policies) — frontend never
-- reads/writes these directly; backend mediates via the OAuth endpoints.

-- ─── 1. oauth_clients ────────────────────────────────────────────────────
-- Dynamically registered MCP clients (one row per Claude Desktop install,
-- Claude Code session, etc.). Public clients only — no client_secret.

create table if not exists public.oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,                  -- 'mcpc_' + 16 hex
  client_name text not null,                       -- self-reported, displayed in consent UI
  redirect_uris jsonb not null,                    -- array of strings
  grant_types jsonb not null default '["authorization_code","refresh_token"]'::jsonb,
  response_types jsonb not null default '["code"]'::jsonb,
  token_endpoint_auth_method text not null default 'none',
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists oauth_clients_client_id_idx on public.oauth_clients(client_id);
create index if not exists oauth_clients_last_used_idx on public.oauth_clients(last_used_at desc nulls last);

alter table public.oauth_clients enable row level security;

-- ─── 2. oauth_authorization_codes ────────────────────────────────────────
-- Short-lived (5min) one-time codes issued after consent. Deleted on use or expiry.

create table if not exists public.oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,                  -- sha256(code) — code never stored raw
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,                    -- S256 challenge (the BASE64URL hash)
  code_challenge_method text not null default 'S256',
  scope text not null,
  resource text not null,                          -- audience the token will be bound to
  state text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

create index if not exists oauth_codes_code_hash_idx on public.oauth_authorization_codes(code_hash);
create index if not exists oauth_codes_expires_at_idx on public.oauth_authorization_codes(expires_at);

alter table public.oauth_authorization_codes enable row level security;

-- ─── 3. oauth_access_tokens ──────────────────────────────────────────────
-- Issued by /oauth/token. One row per access OR refresh token.
-- token_type discriminator: 'access' (1h TTL) | 'refresh' (30d TTL).
-- parent_token_id: refresh tokens point to the refresh they replaced (rotation lineage).
-- audience: RFC 8707 binding; validated by requireAuth.

create table if not exists public.oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,                 -- sha256(token)
  token_type text not null check (token_type in ('access','refresh')),
  client_id text not null references public.oauth_clients(client_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  audience text not null,
  parent_token_id uuid references public.oauth_access_tokens(id) on delete set null,
  family_id uuid not null,                         -- shared by all tokens in a refresh lineage
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  invalidated_at timestamptz,                      -- set when superseded by rotation (dual-valid window)
  last_used_at timestamptz
);

create index if not exists oauth_tokens_token_hash_idx on public.oauth_access_tokens(token_hash);
create index if not exists oauth_tokens_user_id_idx on public.oauth_access_tokens(user_id);
create index if not exists oauth_tokens_family_idx on public.oauth_access_tokens(family_id);
create index if not exists oauth_tokens_expires_at_idx on public.oauth_access_tokens(expires_at);

alter table public.oauth_access_tokens enable row level security;
