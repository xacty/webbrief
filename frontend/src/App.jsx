import { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppShell from './components/layout/AppShell'
import { Select } from './components/ui'
import {
  COMPANY_ROLE_ORDER,
  PLATFORM_ROLE_ORDER,
  getCompanyRoleLabel,
  getPlatformRoleLabel,
} from '../../shared/userRoles.js'
import { Sparkles } from 'lucide-react'
import WelcomeModal from './components/onboarding/WelcomeModal'
import { getTutorialState, markWelcomed, markDismissed, isOnboardingActive, resetTutorial } from './lib/tutorialState'

const Login = lazy(() => import('./pages/Login'))
const NewProject = lazy(() => import('./pages/NewProject'))
const ProjectEditor = lazy(() => import('./pages/ProjectEditor'))
const SetPassword = lazy(() => import('./pages/SetPassword'))
const CompaniesPage = lazy(() => import('./pages/CompaniesPage'))
const CompanyPage = lazy(() => import('./pages/CompanyPage'))
const UsersPage = lazy(() => import('./pages/UsersPage'))
const SharePage = lazy(() => import('./pages/SharePage'))
const TrashPage = lazy(() => import('./pages/TrashPage'))
const AccountSettingsPage = lazy(() => import('./pages/AccountSettingsPage'))
const BriefPage = lazy(() => import('./pages/BriefPage'))
const SecurityPage = lazy(() => import('./pages/SecurityPage'))
const SecurityErrorsPage = lazy(() => import('./pages/SecurityErrorsPage'))
const SecurityBlocksPage = lazy(() => import('./pages/SecurityBlocksPage'))
const IntegrationsPage = lazy(() => import('./pages/IntegrationsPage'))

// Prefixed values disambiguate platform-admin vs company-admin (both label as
// "Admin" historically, value === 'admin' would collide on the <select>).
const ROLE_PREVIEW_OPTIONS = [
  ...PLATFORM_ROLE_ORDER
    .filter((role) => role !== 'user')
    .map((role) => ({ value: `platform:${role}`, label: getPlatformRoleLabel(role) })),
  ...COMPANY_ROLE_ORDER.map((role) => ({ value: `company:${role}`, label: getCompanyRoleLabel(role) })),
  { value: 'public_viewer', label: 'Cliente sin cuenta' },
]

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div className="pageLoading">Cargando...</div>
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function WelcomeGate() {
  const { isAuthenticated, realCurrentUser, loading } = useAuth()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (loading || !isAuthenticated || !realCurrentUser) return
    if (open) return // Already open — skip re-evaluation triggered by auth refresh
    const state = getTutorialState()
    if (!isOnboardingActive(state)) return
    if (state.welcomedAt) return
    // Defer one paint so the shell renders first
    const id = window.requestAnimationFrame(() => setOpen(true))
    return () => window.cancelAnimationFrame(id)
  }, [loading, isAuthenticated, realCurrentUser, open])

  function handleStart() {
    markWelcomed()
    setOpen(false)
  }

  function handleSkip() {
    markDismissed()
    setOpen(false)
  }

  return <WelcomeModal open={open} onStart={handleStart} onSkip={handleSkip} />
}

function AppRoutes() {
  const { realCurrentUser, rolePreview, setRolePreview, isAuthenticated, loading } = useAuth()
  const location = useLocation()
  const canPreviewRoles = realCurrentUser?.platformRole === 'admin'
  const isEditorRoute = location.pathname.startsWith('/project/') && location.pathname.endsWith('/editor')
  const isPublicRoute = location.pathname === '/login'
    || location.pathname === '/auth/set-password'
    || location.pathname.startsWith('/share/')
    || location.pathname.startsWith('/b/')

  return (
    <Suspense fallback={<div className="pageLoading">Cargando...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/set-password" element={<SetPassword />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/b/:token" element={<BriefPage />} />

        <Route
          path="/"
          element={
            <PrivateRoute>
              <AppShell />
            </PrivateRoute>
          }
        >
          <Route index element={<Navigate to="companies" replace />} />
          <Route path="dashboard" element={<Navigate to="/companies" replace />} />
          <Route path="companies" element={<CompaniesPage />} />
          <Route path="companies/:companyId" element={<CompanyPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="settings" element={<AccountSettingsPage />} />
          <Route path="archive" element={<TrashPage mode="archived" />} />
          <Route path="trash" element={<TrashPage mode="trashed" />} />
          <Route path="security" element={<SecurityPage />} />
          <Route path="security/errors" element={<SecurityErrorsPage />} />
          <Route path="security/blocks" element={<SecurityBlocksPage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="new-project" element={<NewProject />} />
        </Route>

        <Route
          path="/project/:id/editor"
          element={
            <PrivateRoute>
              <ProjectEditor />
            </PrivateRoute>
          }
        />
      </Routes>
      {canPreviewRoles && (
        <div style={{ ...rolePreviewStyles.wrap, ...(isEditorRoute ? rolePreviewStyles.wrapEditor : {}) }}>
          <label style={rolePreviewStyles.label} htmlFor="global-role-preview-select">Ver como</label>
          <Select
            id="global-role-preview-select"
            fullWidth={false}
            size="sm"
            value={rolePreview || 'platform:admin'}
            onChange={(event) => setRolePreview(event.target.value)}
          >
            {ROLE_PREVIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          {import.meta.env.DEV && (
            <button
              type="button"
              onClick={() => {
                resetTutorial()
                window.location.assign('/companies')
              }}
              aria-label="Lanzar tutorial"
              title="Resetear y lanzar el tutorial de onboarding (solo dev/admin)"
              style={rolePreviewStyles.devTutorialBtn}
            >
              <Sparkles size={14} aria-hidden="true" />
              <span style={rolePreviewStyles.devTutorialBtnLabel}>Tutorial</span>
            </button>
          )}
        </div>
      )}
      {!loading && isAuthenticated && !isPublicRoute && <WelcomeGate />}
    </Suspense>
  )
}

const rolePreviewStyles = {
  wrap: {
    position: 'fixed',
    right: 18,
    // Match .floatingBar (Brief/Handoff/Preview) bottom so both pills
    // align horizontally at the same baseline in the editor.
    bottom: 22,
    // Lower than --wb-z-popover (1100) so the Select listbox inside the
    // pill opens ABOVE the pill chrome (otherwise the dropdown is
    // visually behind the pill and hovering options closes it). Still
    // above sticky content (200) so the pill floats above the editor
    // and admin shell. Matches the --wb-z-overlay (900) token value.
    zIndex: 900,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    // Tight padding so the pill size-hugs its content (matches the
    // editor's .floatingBar after the trim). Inner Select trigger is
    // 32px → with 4px vertical padding total height is 40px. No
    // min-height; let content drive.
    padding: '4px 4px 4px 12px',
    border: '1px solid var(--wb-border)',
    // Container-tier radius (matches .floatingBar and the toolbar).
    // Full-radius is reserved for labels / status pills — pills that
    // contain a Select/Button get the moderate radius like the rest of
    // the app's clickable surfaces.
    borderRadius: 'var(--wb-radius-3)',
    background: 'var(--wb-surface)',
    boxShadow: 'var(--wb-shadow-lg)',
    WebkitBackdropFilter: 'blur(12px)',
    backdropFilter: 'blur(12px)',
  },
  wrapEditor: {
    right: 318,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--wb-color-neutral-500)',
    whiteSpace: 'nowrap',
  },
  // Dev-only "Lanzar tutorial" button. Lives in the role-preview pill so
  // it only shows for platform admins AND only in `vite dev` builds.
  // Single primary CTA in the cluster — visually subordinate to "Ver como".
  devTutorialBtn: {
    appearance: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '6px 10px',
    background: 'var(--wb-color-primary-100)',
    color: 'var(--wb-color-primary-700)',
    border: 'none',
    borderRadius: 'var(--wb-radius-2)',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  devTutorialBtnLabel: {
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
  },
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
