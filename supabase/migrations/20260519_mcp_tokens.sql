-- mcp_tokens: long-lived tokens for MCP server authentication.
-- Raw tokens are never stored. Only SHA-256 hashes are persisted.
-- Prefix (first 13 chars of raw token) is stored for display only.

CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  label        text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  token_hash   text        NOT NULL UNIQUE,
  prefix       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS mcp_tokens_user_id_idx
  ON public.mcp_tokens (user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS mcp_tokens_hash_idx
  ON public.mcp_tokens (token_hash)
  WHERE revoked_at IS NULL;

-- RLS: deny all end-user access. Backend uses service_role.
ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.mcp_tokens IS
  'Long-lived MCP authentication tokens. Raw token never stored — only SHA-256 hash.';
