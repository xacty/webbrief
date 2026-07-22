// frontend/src/lib/editorPresence.js
// Canal por proyecto para colaboración ligera: Presence (quién está dónde)
// + Broadcast "timbre" de saves. NUNCA transporta contenido del documento.
import { supabase } from './supabase'

export function createEditorChannel({ projectId, sessionId, initialState, onPresenceChange, onRemoteSave }) {
  if (!projectId || !sessionId) {
    return { updatePresence: () => {}, broadcastSaved: () => {}, cleanup: () => {} }
  }

  let joined = false
  let lastState = { ...initialState }

  const channel = supabase.channel(`project:${projectId}:editor`, {
    config: { presence: { key: sessionId }, broadcast: { self: false } },
  })

  channel.on('presence', { event: 'sync' }, () => {
    try {
      const state = channel.presenceState()
      const others = []
      Object.entries(state).forEach(([key, metas]) => {
        if (key === sessionId) return
        const meta = metas[metas.length - 1]
        if (meta) others.push({ ...meta, sessionId: key })
      })
      onPresenceChange(others)
    } catch (error) {
      console.warn('[editorPresence] presence handler:', error.message)
    }
  })

  channel.on('broadcast', { event: 'pages_saved' }, ({ payload }) => {
    if (!payload || payload.sessionId === sessionId) return
    try { onRemoteSave(payload) } catch (error) {
      console.warn('[editorPresence] remote save handler:', error.message)
    }
  })

  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      joined = true
      channel.track({ ...lastState, at: new Date().toISOString() })
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') joined = false
  })

  return {
    updatePresence(patch) {
      lastState = { ...lastState, ...patch }
      if (joined) channel.track({ ...lastState, at: new Date().toISOString() })
    },
    broadcastSaved(payload) {
      if (joined) channel.send({ type: 'broadcast', event: 'pages_saved', payload: { ...payload, sessionId } })
    },
    cleanup() {
      try { supabase.removeChannel(channel) } catch { /* best-effort */ }
    },
  }
}
