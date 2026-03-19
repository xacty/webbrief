// Punto de entrada de la app: define las rutas y protege el dashboard
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import NewProject from './pages/NewProject'
import ProjectEditor from './pages/ProjectEditor'

// Componente que protege rutas privadas.
// Si no hay token en localStorage, redirige al login.
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta pública: login */}
        <Route path="/login" element={<Login />} />

        {/* Ruta protegida: dashboard */}
        <Route
          path="/dashboard"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />

        {/* Ruta protegida: nuevo proyecto */}
        <Route
          path="/new-project"
          element={
            <PrivateRoute>
              <NewProject />
            </PrivateRoute>
          }
        />

        {/* Ruta protegida: editor de proyecto */}
        <Route
          path="/project/:id/editor"
          element={
            <PrivateRoute>
              <ProjectEditor />
            </PrivateRoute>
          }
        />

        {/* Ruta raíz: redirige según si hay sesión o no */}
        <Route
          path="/"
          element={
            localStorage.getItem('token')
              ? <Navigate to="/dashboard" replace />
              : <Navigate to="/login" replace />
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
