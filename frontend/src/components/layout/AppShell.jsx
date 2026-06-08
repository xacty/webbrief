import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Settings, Building2, Users, Shield, Archive, Trash2, Moon, Sun, Plug } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { canManageUsersNav, canUseSecurityNav, canUseTrashNav } from '../../lib/roleCapabilities'
import {
  getCompanyRoleLabel,
  getPlatformRoleTitle,
} from '../../../../shared/userRoles.js'
import webriefLogo from '../../assets/brand/webrief--logo-v2.svg'
import { Button, Card } from '../ui'
import OnboardingChecklist from '../onboarding/OnboardingChecklist'
import {
  getTutorialState,
  markDismissed,
  isOnboardingActive,
  STORAGE_KEY,
} from '../../lib/tutorialState'
import styles from './AppShell.module.css'

function roleLabel(currentUser, canManageUsers) {
  const role = currentUser?.rolePreview || currentUser?.memberships?.[0]?.role
  if (currentUser?.platformRole === 'admin') return getPlatformRoleTitle(currentUser.platformRole)
  if (role) return getCompanyRoleLabel(role)
  return canManageUsers ? 'Manager' : 'Usuario'
}

export default function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { currentUser, signOut } = useAuth()
  const canManageUsers = canManageUsersNav(currentUser)
  const canUseTrash = canUseTrashNav(currentUser)
  const canUseSecurity = canUseSecurityNav(currentUser)

  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem('wb-theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('wb-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const [tutorialState, setTutorialState] = useState(() => getTutorialState())
  const isEditorRoute = location.pathname.startsWith('/project/') && location.pathname.endsWith('/editor')

  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setTutorialState(getTutorialState())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>
            <img className={styles.logo} src={webriefLogo} alt="WeBrief" />
          </div>

          <nav className={styles.nav}>
            <p className={styles.navSectionLabel}>Principal</p>
            <NavLink
              to="/companies"
              className={({ isActive }) => (
                isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              )}
            >
              <Building2 className={styles.navIcon} aria-hidden="true" />
              Empresas
            </NavLink>
            {canManageUsers && (
              <NavLink
                to="/users"
                className={({ isActive }) => (
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                )}
              >
                <Users className={styles.navIcon} aria-hidden="true" />
                Usuarios
              </NavLink>
            )}
            <NavLink
              to="/integrations"
              className={({ isActive }) => (
                isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
              )}
            >
              <Plug className={styles.navIcon} aria-hidden="true" />
              Integraciones
            </NavLink>

            {(canUseSecurity || canUseTrash) && (
              <p className={styles.navSectionLabel}>Admin</p>
            )}
            {canUseSecurity && (
              <NavLink
                to="/security"
                className={({ isActive }) => (
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                )}
              >
                <Shield className={styles.navIcon} aria-hidden="true" />
                Seguridad
              </NavLink>
            )}
            {canUseTrash && (
              <>
                <NavLink
                  to="/archive"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  <Archive className={styles.navIcon} aria-hidden="true" />
                  Archivados
                </NavLink>
                <NavLink
                  to="/trash"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  <Trash2 className={styles.navIcon} aria-hidden="true" />
                  Papelera
                </NavLink>
              </>
            )}
          </nav>
        </div>

        <div className={styles.sidebarFooter}>
          <Card padding="sm" shadow="none" radius="md" className={styles.profileCard}>
            <p className={styles.profileName}>
              {currentUser?.fullName || currentUser?.email || 'Cargando usuario'}
            </p>
            <p className={styles.profileRole}>
              {roleLabel(currentUser, canManageUsers)}
            </p>
          </Card>

          <NavLink
            to="/settings"
            className={({ isActive }) => (
              isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
            )}
          >
            <Settings className={styles.navIcon} aria-hidden="true" />
            Ajustes de cuenta
          </NavLink>

          <button
            type="button"
            className={styles.darkToggle}
            onClick={() => setDarkMode((d) => !d)}
            aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {darkMode ? <Sun size={14} /> : <Moon size={14} />}
            {darkMode ? 'Modo claro' : 'Modo oscuro'}
          </button>

          <Button variant="secondary" onClick={handleLogout} fullWidth>
            Cerrar sesión
          </Button>

          <span className={styles.versionBadge}>v{__APP_VERSION__}</span>
        </div>
      </aside>

      <main className={styles.main}>
        <div key={location.pathname} className={styles.content}>
          <Outlet />
        </div>
      </main>

      {!isEditorRoute && isOnboardingActive(tutorialState) && (
        <OnboardingChecklist
          state={tutorialState}
          onTaskClick={(key) => {
            // Navigation wired in Task 7
            console.log('[onboarding] task clicked:', key)
          }}
          onDismiss={() => {
            const next = markDismissed()
            setTutorialState(next)
          }}
        />
      )}
    </div>
  )
}
