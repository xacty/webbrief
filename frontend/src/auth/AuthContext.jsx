import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'

const AuthContext = createContext(null)
const ROLE_PREVIEW_STORAGE_KEY = 'webrief:role-preview'

function applyRolePreview(user, previewRole) {
  if (!user || user.platformRole !== 'admin' || !previewRole || previewRole === 'admin') return user

  const companyRole = previewRole === 'manager' ? 'manager' : previewRole
  const memberships = (user.memberships?.length ? user.memberships : [{ companyId: '', role: companyRole }])
    .map((membership) => ({ ...membership, role: companyRole }))

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
      return window.localStorage.getItem(ROLE_PREVIEW_STORAGE_KEY) || 'admin'
    } catch {
      return 'admin'
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
    const role = nextRole || 'admin'
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
