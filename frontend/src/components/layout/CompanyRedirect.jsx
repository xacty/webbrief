import { Navigate, useParams } from 'react-router-dom'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { companyToSlug } from '../../lib/companySlug'
import NotFoundPage from '../../pages/NotFoundPage'

/**
 * /companies/:companyId → /c/:companySlug/projects.
 * Preserves legacy bookmarks. If the id doesn't resolve, render 404.
 */
export default function CompanyRedirect() {
  const { companyId } = useParams()
  const { accessibleCompanies, loading } = useWorkspace()

  if (loading) return null
  const company = accessibleCompanies.find((c) => c.id === companyId)
  if (!company) return <NotFoundPage />
  return <Navigate to={`/c/${companyToSlug(company)}/projects`} replace />
}
