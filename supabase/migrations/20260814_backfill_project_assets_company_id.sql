-- Backfill de company_id en project_assets para las filas insertadas por los
-- 4 endpoints que todavía no lo seteaban (BUG B, fix/library-referenced-protection):
-- POST /api/projects/:id/assets, /assets/convert, /brief/documents y
-- POST /api/public/brief/:token/documents. Sin company_id esas filas quedaban
-- fuera de la cuota de almacenamiento (lib/storageQuota.js), invisibles en
-- los tabs Documentos/Briefs de la biblioteca y no exportables.
-- Cubre la ventana entre el deploy de v2.15.1 (sin el fix de código) y el
-- deploy de este fix. Idempotente: solo toca filas con company_id IS NULL y
-- project_id IS NOT NULL; volver a correrla sobre filas ya backfilleadas es
-- un no-op porque la condición deja de matchear. Mismo patrón que el
-- backfill original de 20260719_image_library.sql.
update public.project_assets a set company_id = p.company_id
  from public.projects p
  where a.project_id = p.id
    and a.company_id is null
    and a.project_id is not null;
