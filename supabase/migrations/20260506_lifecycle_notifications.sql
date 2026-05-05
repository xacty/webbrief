-- Migration: file lifecycle — retention notifications con cadencia escalonada
--
-- Política de retención (contado desde projects.trashed_at):
--   • Non-brief (page/document/faq): 30 días → auto-purge de assets + project
--   • Brief: 15 días → auto-purge
--
-- Cadencia de notificaciones (al manager + editor del proyecto):
--   Non-brief: 7d / 1d / 1h / 1m antes del purge
--   Brief:     1d / 1h / 1m antes del purge (sin 7d, ventana muy corta)
--
-- Cada notificación tiene CTA "Mantener proyecto" que resetea trashed_at = NOW()
-- y reagenda toda la cadencia.

CREATE TABLE IF NOT EXISTS project_lifecycle_notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL CHECK (notification_type IN (
    'lifecycle_warn_7d',
    'lifecycle_warn_1d',
    'lifecycle_warn_1h',
    'lifecycle_warn_1m'
  )),
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lifecycle_notifications_pending_idx
  ON project_lifecycle_notifications (scheduled_for)
  WHERE sent_at IS NULL;

CREATE INDEX IF NOT EXISTS lifecycle_notifications_project_idx
  ON project_lifecycle_notifications (project_id);

-- Función helper para insertar las notificaciones de un proyecto basado en su tipo
-- y trashed_at. Se llama desde el endpoint backend cuando un proyecto entra a papelera
-- o se extiende vía "Mantener".
CREATE OR REPLACE FUNCTION schedule_project_lifecycle_notifications(
  p_project_id UUID,
  p_project_type TEXT,
  p_trashed_at TIMESTAMPTZ
) RETURNS VOID AS $$
DECLARE
  retention_interval INTERVAL;
BEGIN
  -- Borrar notificaciones pendientes anteriores
  DELETE FROM project_lifecycle_notifications
  WHERE project_id = p_project_id AND sent_at IS NULL;

  IF p_trashed_at IS NULL THEN
    RETURN;
  END IF;

  IF p_project_type = 'brief' THEN
    retention_interval := INTERVAL '15 days';
    INSERT INTO project_lifecycle_notifications (project_id, notification_type, scheduled_for) VALUES
      (p_project_id, 'lifecycle_warn_1d', p_trashed_at + retention_interval - INTERVAL '1 day'),
      (p_project_id, 'lifecycle_warn_1h', p_trashed_at + retention_interval - INTERVAL '1 hour'),
      (p_project_id, 'lifecycle_warn_1m', p_trashed_at + retention_interval - INTERVAL '1 minute');
  ELSE
    retention_interval := INTERVAL '30 days';
    INSERT INTO project_lifecycle_notifications (project_id, notification_type, scheduled_for) VALUES
      (p_project_id, 'lifecycle_warn_7d', p_trashed_at + retention_interval - INTERVAL '7 days'),
      (p_project_id, 'lifecycle_warn_1d', p_trashed_at + retention_interval - INTERVAL '1 day'),
      (p_project_id, 'lifecycle_warn_1h', p_trashed_at + retention_interval - INTERVAL '1 hour'),
      (p_project_id, 'lifecycle_warn_1m', p_trashed_at + retention_interval - INTERVAL '1 minute');
  END IF;
END;
$$ LANGUAGE plpgsql;

-- pg_cron job (Supabase Pro tier). Si no está disponible, usar el endpoint
-- POST /api/admin/lifecycle/run desde un cron del VPS.
--
-- SELECT cron.schedule(
--   'lifecycle-notifications-tick',
--   '* * * * *',
--   $$ SELECT public.tick_lifecycle_notifications(); $$
-- );
--
-- SELECT cron.schedule(
--   'lifecycle-cleanup-tick',
--   '*/15 * * * *',
--   $$ SELECT public.tick_lifecycle_cleanup(); $$
-- );
