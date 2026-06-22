import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import {
  companyToSlug,
  findCompanyBySlug,
  pickDefaultCompany,
  writeStoredActiveCompany,
} from '../lib/companySlug'

const WorkspaceContext = createContext(null)

const COMPANIES_CACHE_KEY = 'webrief:companies'

function readCompaniesCache() {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(COMPANIES_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed?.companies) ? parsed.companies : null
  } catch {
    return null
  }
}

function writeCompaniesCache(companies) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      COMPANIES_CACHE_KEY,
      JSON.stringify({ companies, cachedAt: new Date().toISOString() }),
    )
  } catch {
    // Quota exceeded — skip cache, app still works.
  }
}

export function WorkspaceProvider({ children }) {
  const { isAuthenticated, realCurrentUser, loading: authLoading } = useAuth()
  const [accessibleCompanies, setAccessibleCompanies] = useState(() => readCompaniesCache() || [])
  const [currentCompany, setCurrentCompany] = useState(null)
  const [loading, setLoading] = useState(true)
  const [createCompanyModalOpen, setCreateCompanyModalOpen] = useState(false)

  // Manually-callable fetch. Used by the auth-settle effect AND by
  // any consumer that mutates the companies list (CompaniesPage).
  const refresh = useCallback(async () => {
    if (!isAuthenticated || !realCurrentUser?.id) return null
    try {
      const data = await apiFetch('/api/companies')
      const list = Array.isArray(data?.companies) ? data.companies : []
      setAccessibleCompanies(list)
      writeCompaniesCache(list)
      return list
    } catch {
      const cached = readCompaniesCache()
      if (cached) setAccessibleCompanies(cached)
      return null
    }
  }, [isAuthenticated, realCurrentUser?.id])

  // Run refresh once whenever authentication settles.
  useEffect(() => {
    if (authLoading) return undefined
    if (!isAuthenticated || !realCurrentUser?.id) {
      setAccessibleCompanies([])
      setCurrentCompany(null)
      setLoading(false)
      return undefined
    }
    let cancelled = false
    setLoading(true)
    refresh().finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [authLoading, isAuthenticated, realCurrentUser?.id, refresh])

  // Resolve current company from accessibleCompanies + localStorage default.
  useEffect(() => {
    if (loading) return
    if (!realCurrentUser?.id) {
      setCurrentCompany(null)
      return
    }
    setCurrentCompany((prev) => {
      // If prev still resolves, keep it.
      if (prev) {
        const stillThere = accessibleCompanies.find((c) => c.id === prev.id)
        if (stillThere) return stillThere
      }
      return pickDefaultCompany(accessibleCompanies, realCurrentUser.id)
    })
  }, [accessibleCompanies, loading, realCurrentUser?.id])

  const switchCompany = useCallback(
    (slug) => {
      if (!slug) return null
      const target = findCompanyBySlug(accessibleCompanies, slug)
      if (!target) return null
      setCurrentCompany(target)
      if (realCurrentUser?.id) {
        writeStoredActiveCompany(realCurrentUser.id, slug)
      }
      return target
    },
    [accessibleCompanies, realCurrentUser?.id],
  )

  const openCreateCompanyModal = useCallback(() => setCreateCompanyModalOpen(true), [])
  const closeCreateCompanyModal = useCallback(() => setCreateCompanyModalOpen(false), [])

  const value = useMemo(
    () => ({
      currentCompany,
      currentCompanySlug: currentCompany ? companyToSlug(currentCompany) : null,
      accessibleCompanies,
      switchCompany,
      loading,
      refresh,
      createCompanyModalOpen,
      openCreateCompanyModal,
      closeCreateCompanyModal,
    }),
    [
      currentCompany,
      accessibleCompanies,
      switchCompany,
      loading,
      refresh,
      createCompanyModalOpen,
      openCreateCompanyModal,
      closeCreateCompanyModal,
    ],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error('useWorkspace must be used inside <WorkspaceProvider>')
  }
  return ctx
}
