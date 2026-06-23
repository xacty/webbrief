import { useState, useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Settings, Building2, Users, Shield, Archive, Trash2, Moon, Sun, Plug, Folder, Activity } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { canManageUsersNav, canUseSecurityNav, canUseTrashNav, isAdmin, canCreateCompany as canCreateCompanyCapability } from '../../lib/roleCapabilities'
import {
  getCompanyRoleLabel,
  getPlatformRoleTitle,
} from '../../../../shared/userRoles.js'
import webriefLogo from '../../assets/brand/webrief--logo-v2.svg'
import { Button, Card } from '../ui'
import OnboardingChecklist from '../onboarding/OnboardingChecklist'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import FirstTimeTooltipsRoot from '../onboarding/FirstTimeTooltipsRoot'
import useTutorialAutoComplete from '../onboarding/useTutorialAutoComplete'
import { useTour } from '../onboarding/TourContext'
import {
  getTutorialState,
  markDismissed,
  markCompleted,
  isOnboardingActive,
  STORAGE_KEY,
  STATE_CHANGE_EVENT,
  TASK_KEYS,
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
  const { accessibleCompanies, currentCompanySlug } = useWorkspace()
  const { startFullTutorial, isActive: tourIsActive } = useTour()
  const canCreateCompany = canCreateCompanyCapability(currentUser)
  const canViewAllCompaniesFromSwitcher = isAdmin(currentUser) || accessibleCompanies.length >= 3
  const canSeeCompaniesListNav = isAdmin(currentUser) || accessibleCompanies.length >= 3
  const canManageUsers = canManageUsersNav(currentUser)
  const canUseTrash = canUseTrashNav(currentUser)
  const canUseSecurity = canUseSecurityNav(currentUser)

  // Dark mode tiene bugs sin resolver — se mantiene solo en dev.
  const allowDarkMode = import.meta.env.DEV
  const [darkMode, setDarkMode] = useState(
    () => allowDarkMode && localStorage.getItem('wb-theme') === 'dark'
  )

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('wb-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  const [tutorialState, setTutorialState] = useState(() => getTutorialState())
  const isEditorRoute = location.pathname.startsWith('/project/') && location.pathname.endsWith('/editor')
  // Public viewers (real or simulated via role-preview) get no tutorial UI.
  const isPreviewingPublicViewer = currentUser?.rolePreview === 'public_viewer'

  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY) setTutorialState(getTutorialState())
    }
    function onSameTabChange() {
      setTutorialState(getTutorialState())
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(STATE_CHANGE_EVENT, onSameTabChange)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STATE_CHANGE_EVENT, onSameTabChange)
    }
  }, [])

  useEffect(() => {
    // Count only current TASK_KEYS so legacy entries (e.g. an old
    // `create_company` row) don't throw off the all-done check.
    const doneCount = TASK_KEYS.filter((k) => tutorialState.tasks[k]?.doneAt).length
    if (doneCount === TASK_KEYS.length && !tutorialState.completedAt) {
      // Give the user ~2 min to read the celebration card before it
      // auto-closes. They can also dismiss it manually via the X.
      const id = setTimeout(() => {
        const next = markCompleted()
        setTutorialState(next)
      }, 120000)
      return () => clearTimeout(id)
    }
    return undefined
  }, [tutorialState])

  useTutorialAutoComplete(setTutorialState)

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  // Click a checklist task → start the chain from that task. The
  // chain auto-advances through remaining (pending) tasks; the
  // clicked task itself is always replayed, even if already done.
  function handleTaskClick(key) {
    startFullTutorial(key)
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div>
          <div className={styles.brand}>
            <img className={styles.logo} src={webriefLogo} alt="WeBrief" />
          </div>

          <div className={styles.workspaceSwitcherSlot}>
            <WorkspaceSwitcher
              canCreateCompany={canCreateCompany}
              canViewAllCompanies={canViewAllCompaniesFromSwitcher}
              onCreateCompany={() => navigate('/companies?new=1')}
              onViewAllCompanies={() => navigate('/companies')}
            />
          </div>

          <nav className={styles.nav}>
            <p className={styles.navSectionLabel}>Principal</p>
            {currentCompanySlug && (
              <>
                <NavLink
                  to={`/c/${currentCompanySlug}/projects`}
                  data-tour="sidebar-projects"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  <Folder className={styles.navIcon} aria-hidden="true" />
                  Proyectos
                </NavLink>
                <NavLink
                  to={`/c/${currentCompanySlug}/team`}
                  data-tour="sidebar-team"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  <Users className={styles.navIcon} aria-hidden="true" />
                  Equipo
                </NavLink>
                <NavLink
                  to={`/c/${currentCompanySlug}/activity`}
                  data-tour="sidebar-activity"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  <Activity className={styles.navIcon} aria-hidden="true" />
                  Actividad
                </NavLink>
              </>
            )}
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

            {(canUseSecurity || canUseTrash || canSeeCompaniesListNav) && (
              <p className={styles.navSectionLabel}>Admin</p>
            )}
            {canSeeCompaniesListNav && (
              <NavLink
                to="/companies"
                className={({ isActive }) => (
                  isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                )}
              >
                <Building2 className={styles.navIcon} aria-hidden="true" />
                Empresas
              </NavLink>
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
                  data-tour="sidebar-archivados"
                  className={({ isActive }) => (
                    isActive ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem
                  )}
                >
                  <Archive className={styles.navIcon} aria-hidden="true" />
                  Archivados
                </NavLink>
                <NavLink
                  to="/trash"
                  data-tour="sidebar-papelera"
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

          {allowDarkMode && (
            <button
              type="button"
              className={styles.darkToggle}
              onClick={() => setDarkMode((d) => !d)}
              aria-label={darkMode ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {darkMode ? <Sun size={14} /> : <Moon size={14} />}
              {darkMode ? 'Modo claro' : 'Modo oscuro'}
            </button>
          )}

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

      {!isEditorRoute &&
        !isPreviewingPublicViewer &&
        isOnboardingActive(tutorialState) && (
          <OnboardingChecklist
            state={tutorialState}
            onTaskClick={handleTaskClick}
            onDismiss={() => {
              const next = markDismissed()
              setTutorialState(next)
            }}
            onComplete={() => {
              const next = markCompleted()
              setTutorialState(next)
            }}
          />
        )}
      {/* Suppress the legacy data-firsttime tooltips while a guided
       *  tour is active so the two overlays don't fight for the
       *  user's attention. */}
      {!isPreviewingPublicViewer && !tourIsActive && <FirstTimeTooltipsRoot />}
    </div>
  )
}
