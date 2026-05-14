import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Frontend auth will fail until they are configured.'
  )
}

// Capture URL hash type (invite | recovery) BEFORE createClient parses+clears it.
// This is the only reliable way to know if the user arrived via a recovery link
// once Supabase has consumed the hash (Supabase's detectSessionInUrl is async
// but its session-recovery work clears window.location.hash; capturing
// synchronously here guarantees we see it).
const _initialHash = typeof window !== 'undefined' ? (window.location.hash || '') : ''
const _initialHashParams = new URLSearchParams(
  _initialHash.startsWith('#') ? _initialHash.slice(1) : _initialHash
)
export const INITIAL_AUTH_TYPE = _initialHashParams.get('type') || null

export const supabase = createClient(
  supabaseUrl || 'http://localhost:54321',
  supabaseAnonKey || 'missing-anon-key'
)

