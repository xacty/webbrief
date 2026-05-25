import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'

const AuthContext = createContext(null)
const ROLE_PREVIEW_STORAGE_KEY = 'webrief:role-preview'

// Normalize legacy unprefixed values from localStorage to the new
// 'platform:*' / 'company:*' format introduced when company-admin role
// was added (PR 3 made both PLATFORM and COMPANY contain 'admin').
function normalizeLegacyPreview(stored) {
  if (!stored) return 'platform:admin'
  if (stored.startsWith('platform:') || stored.startsWith('company:') || stored === 'public_viewer') return stored
  if (stored === 'admin') return 'platform:admin'
  if (stored === 'qa') return 'platform:qa'
  if (['manager', 'editor', 'content_writer', 'designer', 'developer'].includes(stored)) {
    return `company:${stored}`
  }
  return 'platform:admin'
}

function applyRolePreview(user, previewRole) {
  if (!user || user.platformRole !== 'admin' || !previewRole) return user
  // 'platform:admin' = no preview (admin sees the app as themselves).
  if (previewRole === 'platform:admin') return user

  // Extract the inner role from the prefix. Defensive: unknown formats fall
  // through unchanged (which the company-branch handles by stamping that
  // string into memberships — best-effort, won't crash).
  let innerRole
  if (previewRole.startsWith('platform:')) innerRole = previewRole.slice('platform:'.length)
  else if (previewRole.startsWith('company:')) innerRole = previewRole.slice('company:'.length)
  else innerRole = previewRole

  const memberships = (user.memberships?.length ? user.memberships : [{ companyId: '', role: innerRole }])
    .map((membership) => ({ ...membership, role: innerRole }))

  return {
    ...user,
    platformRole: 'user',
    memberships,
    rolePreview: previewRole,
    realPlatformRole: user.platformRole,
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)
  const [rolePreview, setRolePreviewState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(ROLE_PREVIEW_STORAGE_KEY)
      const normalized = normalizeLegacyPreview(stored)
      // Persist the normalized form so future loads skip the migration path.
      if (stored !== normalized) {
        try { window.localStorage.setItem(ROLE_PREVIEW_STORAGE_KEY, normalized) } catch { /* ignore */ }
      }
      return normalized
    } catch {
      return 'platform:admin'
    }
  })
  const [loading, setLoading] = useState(true)
  const hydratedTokenRef = useRef(null)
  const refreshPromiseRef = useRef(null)

  async function refreshUser(nextSession = session, options = {}) {
    if (!nextSession) {
      setCurrentUser(null)
      hydratedTokenRef.current = null
      return null
    }

    const token = nextSession.access_token
    if (!options.force && hydratedTokenRef.current === token && currentUser) {
      return currentUser
    }

    if (refreshPromiseRef.current?.token === token) {
      return refreshPromiseRef.current.promise
    }

    const promise = apiFetch('/api/auth/me')
      .then((data) => {
        setCurrentUser(data.user)
        hydratedTokenRef.current = token
        return data.user
      })
      .catch((error) => {
        if (error.status === 401) {
          // Token expired or invalid — clear local user state but do NOT force signOut().
          // Supabase will fire TOKEN_REFRESHED if it can refresh, or SIGNED_OUT if it can't.
          // Forcing signOut() here cancels the refresh cycle and logs the user out unnecessarily.
          setCurrentUser(null)
          hydratedTokenRef.current = null
        } else {
          setCurrentUser(null)
        }
        throw error
      })
      .finally(() => {
        if (refreshPromiseRef.current?.token === token) {
          refreshPromiseRef.current = null
        }
      })

    refreshPromiseRef.current = { token, promise }

    try {
      return await promise
    } catch (error) {
      throw error
    }
  }

  useEffect(() => {
    let active = true
    let initialSessionReceived = false

    // Safety-net: if INITIAL_SESSION never fires (shouldn't happen), unblock after 800ms
    const safetyTimer = window.setTimeout(() => {
      if (!active || initialSessionReceived) return
      console.warn('AuthContext: INITIAL_SESSION not received; unblocking UI')
      setLoading(false)
    }, 800)

    function hydrateCurrentUser(nextSession) {
      return refreshUser(nextSession).catch((error) => {
        if (error.status !== 401) {
          console.error('Failed to refresh current user', error)
        }
      })
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return

      if (event === 'INITIAL_SESSION') {
        // Fires immediately from localStorage — no network call needed.
        // This is the fast path: unblock the UI right away.
        initialSessionReceived = true
        clearTimeout(safetyTimer)
        setSession(nextSession)
        setLoading(false)
        if (nextSession) {
          hydrateCurrentUser(nextSession)
        }
        return
      }

      if (event === 'SIGNED_OUT') {
        setSession(null)
        setCurrentUser(null)
        hydratedTokenRef.current = null
        setLoading(false)
        return
      }

      // TOKEN_REFRESHED, SIGNED_IN, USER_UPDATED, etc.
      setSession(nextSession)

      if (!nextSession) {
        setCurrentUser(null)
        hydratedTokenRef.current = null
        return
      }

      window.setTimeout(() => {
        if (!active) return
        hydrateCurrentUser(nextSession)
      }, 0)
    })

    return () => {
      active = false
      clearTimeout(safetyTimer)
      listener.subscription.unsubscribe()
    }
  }, [])

  async function signIn(email, password) {
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      throw error
    }

    setSession(data.session)

    try {
      return await refreshUser(data.session)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    setLoading(true)

    try {
      await supabase.auth.signOut()
      setSession(null)
      setCurrentUser(null)
    } finally {
      setLoading(false)
    }
  }

  function setRolePreview(nextRole) {
    const role = nextRole || 'platform:admin'
    setRolePreviewState(role)
    try {
      window.localStorage.setItem(ROLE_PREVIEW_STORAGE_KEY, role)
    } catch {
      // Ignore storage failures; preview still works for this session.
    }
  }

  const effectiveUser = applyRolePreview(currentUser, rolePreview)

  return (
    <AuthContext.Provider
      value={{
        session,
        currentUser: effectiveUser,
        realCurrentUser: currentUser,
        rolePreview,
        setRolePreview,
        loading,
        isAuthenticated: Boolean(session),
        signIn,
        signOut,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
