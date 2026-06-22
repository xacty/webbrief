/**
 * Pure helpers for company slug → company resolution.
 * No React, no localStorage, no side effects. Safe to import anywhere.
 *
 * Companies have a `slug` field server-side. This module assumes that
 * field is the canonical identifier in URLs. If a company has no slug
 * (legacy rows), `companyToSlug` falls back to a kebab-cased name.
 */

const NON_SLUG_CHARS = /[^a-z0-9-]+/g;
const MULTI_DASH = /-{2,}/g;
const TRIM_DASH = /^-+|-+$/g;

export function companyToSlug(company) {
  if (!company) return '';
  if (company.slug) return company.slug;
  const name = (company.name || '').toLowerCase().trim();
  return name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(NON_SLUG_CHARS, '-')
    .replace(MULTI_DASH, '-')
    .replace(TRIM_DASH, '');
}

export function findCompanyBySlug(companies, slug) {
  if (!Array.isArray(companies) || !slug) return null;
  return companies.find((c) => companyToSlug(c) === slug) || null;
}

export function activeCompanyStorageKey(userId) {
  if (!userId) return null;
  return `wb-active-company:${userId}`;
}

export function readStoredActiveCompany(userId) {
  if (typeof window === 'undefined') return null;
  const key = activeCompanyStorageKey(userId);
  if (!key) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStoredActiveCompany(userId, slug) {
  if (typeof window === 'undefined') return;
  const key = activeCompanyStorageKey(userId);
  if (!key) return;
  try {
    if (slug) {
      window.localStorage.setItem(key, slug);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Swallow QuotaExceededError or denial in private modes.
  }
}

/**
 * Pick the default active company for a user.
 * Priority:
 *   1. last-used (from localStorage) if it still resolves
 *   2. first non-internal membership-backed company
 *   3. first company at all
 *   4. null  → caller should redirect to /companies for setup
 */
export function pickDefaultCompany(accessibleCompanies, userId) {
  if (!Array.isArray(accessibleCompanies) || accessibleCompanies.length === 0) {
    return null;
  }
  const storedSlug = readStoredActiveCompany(userId);
  if (storedSlug) {
    const stored = findCompanyBySlug(accessibleCompanies, storedSlug);
    if (stored) return stored;
  }
  const nonInternal = accessibleCompanies.find((c) => !c.isInternal);
  if (nonInternal) return nonInternal;
  return accessibleCompanies[0];
}
