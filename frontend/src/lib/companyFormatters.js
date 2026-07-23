/**
 * Shared formatters for company/project surfaces.
 * Used by CompaniesPage + the workspace pages (Projects/Team/Activity).
 */

export function formatDate(isoDate) {
  if (!isoDate) return 'Sin actividad'

  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatRelativeDate(isoDate) {
  if (!isoDate) return 'sin actividad'
  const now = new Date()
  const then = new Date(isoDate)
  const diffMs = now - then
  const diffMin = Math.round(diffMs / 60000)
  const diffH = Math.round(diffMs / 3600000)
  const diffD = Math.round(diffMs / 86400000)
  if (diffMin < 1) return 'hace instantes'
  if (diffMin < 60) return `hace ${diffMin} min`
  if (diffH < 24) return `hace ${diffH} h`
  if (diffD === 1) return 'ayer'
  if (diffD < 7) return `hace ${diffD} días`
  if (diffD < 30) return `hace ${Math.round(diffD / 7)} semanas`
  return `el ${formatDate(isoDate)}`
}

export function projectTypeLabel(projectType) {
  if (projectType === 'document') return 'Artículo'
  if (projectType === 'faq') return 'FAQs'
  if (projectType === 'brief') return 'Brief'
  return 'Contenido Web'
}
