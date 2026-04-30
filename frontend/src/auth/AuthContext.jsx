import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'

const AuthContext = createContext(null)
const SESSION_TIMEOUT_MS = 1500
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

function getSessionWithTimeout() {
  return Promise.race([
    supabase.auth.getSession(),
    new Promise((resolve) => {
      window.setTimeout(() => {
        resolve({
          data: { session: null },
          error: null,
          timedOut: true,
        })
      }, SESSION_TIMEOUT_MS)
    }),
  ])
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
      .catch(async (error) => {
        if (error.status === 401) {
          await supabase.auth.signOut()
          setSession(null)
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

    function hydrateCurrentUser(nextSession) {
      return refreshUser(nextSession).catch((error) => {
        if (error.status !== 401) {
          console.error('Failed to refresh current user', error)
        }
      })
    }

    async function bootstrap() {
      try {
        const { data, error, timedOut } = await getSessionWithTimeout()
        if (error) throw error
        if (!active) return

        if (timedOut) {
          console.warn('Supabase session bootstrap timed out; continuing without blocking the UI')
        }

        setSession(data.session)
        setLoading(false)

        if (data.session) {
          hydrateCurrentUser(data.session)
        }
      } catch (error) {
        if (!active) return
        console.error('Failed to initialize auth session', error)
        setSession(null)
        setCurrentUser(null)
        setLoading(false)
      }
    }

    bootstrap()

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      if (event === 'INITIAL_SESSION') return

      setSession(nextSession)

      if (!nextSession) {
        setCurrentUser(null)
        hydratedTokenRef.current = null
        setLoading(false)
        return
      }

      window.setTimeout(() => {
        if (!active) return
        hydrateCurrentUser(nextSession)
      }, 0)
    })

    return () => {
      active = false
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
