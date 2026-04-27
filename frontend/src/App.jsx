import { Suspense, lazy } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import AppShell from './components/layout/AppShell'

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

function PrivateRoute({ children }) {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div className="pageLoading">Cargando...</div>
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />
}

function RootRedirect() {
  const { isAuthenticated, loading } = useAuth()

  if (loading) {
    return <div className="pageLoading">Cargando...</div>
  }

  return isAuthenticated
    ? <Navigate to="/companies" replace />
    : <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Suspense fallback={<div className="pageLoading">Cargando...</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/auth/set-password" element={<SetPassword />} />
        <Route path="/share/:token" element={<SharePage />} />

        <Route
          element={
            <PrivateRoute>
              <AppShell />
            </PrivateRoute>
          }
        >
          <Route path="/dashboard" element={<Navigate to="/companies" replace />} />
          <Route path="/companies" element={<CompaniesPage />} />
          <Route path="/companies/:companyId" element={<CompanyPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/settings" element={<AccountSettingsPage />} />
          <Route path="/archive" element={<TrashPage mode="archived" />} />
          <Route path="/trash" element={<TrashPage mode="trashed" />} />
          <Route path="/new-project" element={<NewProject />} />
        </Route>

        <Route
          path="/project/:id/editor"
          element={
            <PrivateRoute>
              <ProjectEditor />
            </PrivateRoute>
          }
        />

        <Route path="/" element={<RootRedirect />} />
      </Routes>
    </Suspense>
  )
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
