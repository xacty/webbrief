-- 20260525_company_admin_role.sql
-- Introduces the company-admin role (Google Workspace-style) on
-- public.company_memberships.role. Adds 'admin' to the allowed enum
-- and backfills the earliest manager of each company to admin.
--
-- Hierarchy after this migration: admin > manager > editor > {content_writer | designer | developer}
--
-- Idempotent end-to-end:
--   - The CHECK constraint is DROPped (IF EXISTS) and re-added with 'admin' included
--   - The backfill UPDATE targets only companies that DON'T yet have an admin
--     so re-running this migration is a no-op once each eligible company has one.

BEGIN;

-- 1) Replace the CHECK constraint to allow 'admin' alongside the existing roles.
ALTER TABLE public.company_memberships
  DROP CONSTRAINT IF EXISTS company_memberships_role_check;

ALTER TABLE public.company_memberships
  ADD CONSTRAINT company_memberships_role_check
  CHECK (role = ANY (ARRAY[
    'admin'::text,
    'manager'::text,
    'editor'::text,
    'content_writer'::text,
    'designer'::text,
    'developer'::text
  ]));

-- 2) Backfill: for each company without an admin yet, promote the earliest
-- manager (by created_at ASC, id ASC tiebreaker) to admin. Idempotent — once
-- a company has any admin, the WHERE excludes it on subsequent runs.
WITH companies_without_admin AS (
  SELECT id FROM public.companies c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.company_memberships m
    WHERE m.company_id = c.id AND m.role = 'admin'
  )
),
first_managers AS (
  SELECT DISTINCT ON (company_id) id, company_id
  FROM public.company_memberships
  WHERE role = 'manager' AND company_id IN (SELECT id FROM companies_without_admin)
  ORDER BY company_id, created_at ASC, id ASC
)
UPDATE public.company_memberships
SET role = 'admin', updated_at = now()
WHERE id IN (SELECT id FROM first_managers);

-- 3) Companies with no managers at all (e.g. admin-only test companies via testMode)
-- get no automatic admin. Platform-admins can promote someone manually later.

COMMIT;
