import { Router } from 'express'
import { supabaseAdmin } from '../lib/supabase.js'
import { isMissingTableError } from '../lib/projectAccess.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
let notificationsTableAvailable = true
let notificationsRetryAt = 0

router.use(requireAuth)

function serializeNotification(notification) {
  return {
    id: notification.id,
    projectId: notification.project_id,
    eventType: notification.event_type,
    title: notification.title,
    body: notification.body,
    readAt: notification.read_at,
    metadata: notification.metadata || {},
    createdAt: notification.created_at,
  }
}

router.get('/', async (req, res) => {
  try {
    if (!notificationsTableAvailable) {
      if (Date.now() < notificationsRetryAt) {
        return res.json({ notifications: [], notificationsAvailable: false })
      }
      notificationsTableAvailable = true
    }

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('id, project_id, event_type, title, body, read_at, metadata, created_at')
      .eq('user_id', req.currentUser.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      if (isMissingTableError(error, 'notifications')) {
        notificationsTableAvailable = false
        notificationsRetryAt = Date.now() + 30_000
        return res.json({ notifications: [], notificationsAvailable: false })
      }

      return res.status(500).json({ error: error.message })
    }

    return res.json({ notifications: (data || []).map(serializeNotification), notificationsAvailable: true })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudieron cargar las notificaciones' })
  }
})

router.patch('/:id/read', async (req, res) => {
  try {
    if (!notificationsTableAvailable) {
      return res.status(404).json({ error: 'Notificación no encontrada' })
    }

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.currentUser.id)
      .select('id, project_id, event_type, title, body, read_at, metadata, created_at')
      .maybeSingle()

    if (error) {
      if (isMissingTableError(error, 'notifications')) {
        notificationsTableAvailable = false
        return res.status(404).json({ error: 'Notificación no encontrada' })
      }

      return res.status(500).json({ error: error.message })
    }

    if (!data) return res.status(404).json({ error: 'Notificación no encontrada' })
    return res.json({ notification: serializeNotification(data) })
  } catch (error) {
    return res.status(500).json({ error: error.message || 'No se pudo marcar la notificación' })
  }
})

export default router
