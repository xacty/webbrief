import { useEffect } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { findCompanyBySlug, companyToSlug } from '../../lib/companySlug'
import NotFoundPage from '../../pages/NotFoundPage'

/**
 * Route wrapper for /c/:companySlug/*. Resolves the URL slug → company,
 * syncs the active company in WorkspaceContext (and localStorage), and
 * renders either the children outlet or a 404 surface.
 *
 * Loading semantics: while the context is still fetching companies, we
 * render null (not 404) so we don't flash an error during the first
 * paint after login.
 */
export default function WorkspaceLayout() {
  const { companySlug } = useParams()
  const { accessibleCompanies, currentCompany, switchCompany, loading } = useWorkspace()

  const resolved = findCompanyBySlug(accessibleCompanies, companySlug)

  // Sync the URL slug into the workspace state so the switcher reflects it.
  useEffect(() => {
    if (loading) return
    if (!resolved) return
    if (currentCompany && companyToSlug(currentCompany) === companySlug) return
    switchCompany(companySlug)
  }, [loading, resolved, currentCompany, companySlug, switchCompany])

  if (loading) return null
  if (!resolved) return <NotFoundPage />
  return <Outlet />
}
