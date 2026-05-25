import { Suspense, lazy } from 'react'
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

const ROLE_PREVIEW_OPTIONS = [
  ...PLATFORM_ROLE_ORDER
    .filter((role) => role !== 'user')
    .map((role) => ({ value: role, label: getPlatformRoleLabel(role) })),
  ...COMPANY_ROLE_ORDER.map((role) => ({ value: role, label: getCompanyRoleLabel(role) })),
  { value: 'public_viewer', label: 'Cliente sin cuenta' },
]

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div className="pageLoading">Cargando...</div>
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function AppRoutes() {
  const { realCurrentUser, rolePreview, setRolePreview } = useAuth()
  const location = useLocation()
  const canPreviewRoles = realCurrentUser?.platformRole === 'admin'
  const isEditorRoute = location.pathname.startsWith('/project/') && location.pathname.endsWith('/editor')

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
            value={rolePreview || 'admin'}
            onChange={(event) => setRolePreview(event.target.value)}
          >
            {ROLE_PREVIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
      )}
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
    // 48px = .floatingBar min-height. Inner Select trigger is 32px
    // (size="sm" matches the toolbar's .blockSelectButton), so vertical
    // padding is 8px to keep total height at exactly 48 (8 + 32 + 8 = 48).
    // Horizontal 16px left gives the "Ver como" label breathing room;
    // 8px right matches the sm-trigger's natural padding-right.
    minHeight: 48,
    padding: '8px 8px 8px 16px',
    border: '1px solid var(--wb-border)',
    borderRadius: 'var(--wb-radius-full)',
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
