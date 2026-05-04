import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppShell from './components/layout/AppShell'
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

const ROLE_PREVIEW_OPTIONS = [
  ...PLATFORM_ROLE_ORDER
    .filter((role) => role !== 'user')
    .map((role) => ({ value: role, label: getPlatformRoleLabel(role) })),
  ...COMPANY_ROLE_ORDER.map((role) => ({ value: role, label: getCompanyRoleLabel(role) })),
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
          <select
            id="global-role-preview-select"
            style={rolePreviewStyles.select}
            value={rolePreview || 'admin'}
            onChange={(event) => setRolePreview(event.target.value)}
          >
            {ROLE_PREVIEW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      )}
    </Suspense>
  )
}

const rolePreviewStyles = {
  wrap: {
    position: 'fixed',
    right: 18,
    bottom: 18,
    zIndex: 3000,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    border: '1px solid #d9e1ec',
    borderRadius: 12,
    background: '#fff',
    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.16)',
  },
  wrapEditor: {
    right: 318,
  },
  label: {
    fontSize: 12,
    fontWeight: 700,
    color: '#64748b',
  },
  select: {
    border: '1px solid #d9e1ec',
    borderRadius: 9,
    padding: '7px 30px 7px 9px',
    background: '#fff',
    color: '#091223',
    fontSize: 13,
    fontWeight: 700,
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
