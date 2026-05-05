-- Migration: brief uploads (PDF/Office/images) with dual storage providers
--
-- Reusa la tabla `project_assets` (que ya tiene storage_bucket, storage_path,
-- mime_type, file_size, asset_kind, imagekit_file_id) para guardar tanto
-- imágenes (ImageKit) como documentos (Supabase Storage).
--
-- El proveedor se infiere de los campos:
--   • imagekit_file_id NOT NULL → ImageKit (legacy + imágenes nuevas)
--   • storage_bucket = 'brief-documents' AND imagekit_file_id IS NULL → Supabase Storage
--
-- Cambios mínimos:
--   • projects.brief_max_file_mb: tope individual por archivo (10/25/50 MB)
--
-- Constante backend `PROJECT_TOTAL_BUDGET_MB = 500` vive en src/routes/projects.js
-- (suma de file_size de todos los assets del proyecto).
--
-- Requires manual step (Storage no se crea via SQL):
--   • Crear bucket "brief-documents" en Supabase Storage (PRIVADO).
--     Dashboard: Storage > New bucket > name="brief-documents" > Private.
--     O vía API en backend startup:
--       await supabaseAdmin.storage.createBucket('brief-documents', {
--         public: false,
--         fileSizeLimit: 50 * 1024 * 1024,
--       })

-- 1. Tope por archivo individual (10/25/50 MB seleccionable por editor)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS brief_max_file_mb INTEGER NOT NULL DEFAULT 10
    CHECK (brief_max_file_mb IN (10, 25, 50));

-- 2. (Opcional) Index para sumar storage por proyecto rápido cuando se valida budget
CREATE INDEX IF NOT EXISTS project_assets_size_idx
  ON project_assets (project_id)
  WHERE file_size IS NOT NULL;
