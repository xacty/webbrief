/**
 * Shared helpers for the per-company sessionStorage cache.
 * Used by CompaniesPage (list cache) + the workspace pages
 * (detail cache per company).
 *
 * Keys:
 *   webrief:companies         — list of accessible companies
 *   webrief:company:<id>      — per-company detail (projects, members, activity)
 */

export function getCompanyCacheKey(companyId) {
  return `webrief:company:${companyId}`
}

export function readCompanyCache(companyId) {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(getCompanyCacheKey(companyId)))
    if (!cached?.company) return null
    return cached
  } catch {
    return null
  }
}

export function writeCompanyCache(companyId, payload) {
  try {
    window.sessionStorage.setItem(getCompanyCacheKey(companyId), JSON.stringify({
      company: payload.company,
      projects: payload.projects || [],
      members: payload.members || [],
      cachedAt: new Date().toISOString(),
    }))
  } catch {
    // Ignore storage failures; network data still renders.
  }
}

export function clearCompaniesCache() {
  try {
    window.sessionStorage.removeItem('webrief:companies')
  } catch {
    // Ignore storage failures; network data still renders.
  }
}

export function clearCompanyDetailCaches() {
  try {
    for (const key of Object.keys(window.sessionStorage)) {
      if (key.startsWith('webrief:company:')) {
        window.sessionStorage.removeItem(key)
      }
    }
  } catch {
    // Ignore storage failures; network data still renders.
  }
}
