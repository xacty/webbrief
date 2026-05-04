-- Migration: add brief feature columns and tables
-- Adds:
--   • projects.brief_share_token   — unique token for public brief access
--   • projects.project_type        — if not already present (may already exist)
--   • brief_responses              — stores client form submissions
--   • project_templates            — per-company reusable project structure templates

-- 1. Add brief_share_token to projects (unique, nullable)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brief_share_token TEXT UNIQUE;

-- 2. Add project_type to projects if not present
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type TEXT;

-- 3. Create brief_responses table
CREATE TABLE IF NOT EXISTS brief_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  share_token   TEXT NOT NULL,
  respondent_name   TEXT,
  respondent_email  TEXT,
  answers       JSONB NOT NULL DEFAULT '{}',
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS brief_responses_project_id_idx
  ON brief_responses (project_id);

CREATE INDEX IF NOT EXISTS brief_responses_share_token_idx
  ON brief_responses (share_token);

-- 4. Create project_templates table
CREATE TABLE IF NOT EXISTS project_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  project_type    TEXT NOT NULL DEFAULT 'page',
  structure_json  JSONB NOT NULL DEFAULT '[]',
  created_by      UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_templates_company_id_idx
  ON project_templates (company_id);
