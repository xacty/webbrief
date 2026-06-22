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
import { readCompanyCache } from '../../lib/companyCache'
import {
  buildWorkspaceTour,
  buildCreateProjectTour,
  buildEditPageTour,
  buildShareLinkInfo,
  buildLeaveCommentInfo,
} from '../../lib/onboardingTours'
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
  const { accessibleCompanies, currentCompany, currentCompanySlug } = useWorkspace()
  const { start: startTour } = useTour()
  const canCreateCompany = canCreateCompanyCapability(currentUser)
  const canViewAllCompaniesFromSwitcher = isAdmin(currentUser) || accessibleCompanies.length >= 3
  const canSeeCompaniesListNav = isAdmin(currentUser) || accessibleCompanies.length >= 3
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
      const id = setTimeout(() => {
        const next = markCompleted()
        setTutorialState(next)
      }, 5000)
      return () => clearTimeout(id)
    }
    return undefined
  }, [tutorialState])

  useTutorialAutoComplete(setTutorialState)

  async function handleLogout() {
    await signOut()
    navigate('/login')
  }

  function handleTaskClick(key) {
    const slug = currentCompanySlug
    const isPlatformAdmin = isAdmin(currentUser)
    // Resolve membership role for the active company (falls back to
    // rolePreview when the admin is simulating).
    const role =
      currentUser?.rolePreview ||
      currentUser?.memberships?.find((m) => m.companyId === currentCompany?.id)?.role ||
      null
    const cached = currentCompany?.id ? readCompanyCache(currentCompany.id) : null
    const projects = Array.isArray(cached?.projects) ? cached.projects : []
    const hasProjects = projects.length > 0

    switch (key) {
      case 'discover_workspace':
        startTour(buildWorkspaceTour({ isPlatformAdmin }))
        break
      case 'invite_member':
        // Navigate-only for now; team-page guidance is a future iteration.
        navigate(slug ? `/c/${slug}/team?invite=1` : '/companies')
        break
      case 'create_project':
        startTour(buildCreateProjectTour({ hasProjects, currentCompanySlug: slug }))
        break
      case 'edit_page':
        if (hasProjects) {
          // Open the most recently edited project so the editor anchors
          // are mounted by the time the tour reaches them.
          const sortedByEdit = [...projects].sort((a, b) => {
            const at = a?.updatedAt || a?.editedAt || ''
            const bt = b?.updatedAt || b?.editedAt || ''
            return bt.localeCompare(at)
          })
          const target = sortedByEdit[0]
          if (target?.id) navigate(`/project/${target.id}/editor`)
          // Defer tour start so the editor mounts first (anchors need to
          // be present in the DOM for Spotlight to find them).
          setTimeout(() => {
            startTour(buildEditPageTour({ projectType: target?.projectType, role }))
          }, 600)
        } else {
          startTour(buildCreateProjectTour({ hasProjects: false, currentCompanySlug: slug }))
        }
        break
      case 'create_share_link':
        startTour(buildShareLinkInfo())
        break
      case 'leave_comment':
        startTour(buildLeaveCommentInfo())
        break
      default:
        navigate(slug ? `/c/${slug}/projects` : '/companies')
    }
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
          />
        )}
      {!isPreviewingPublicViewer && <FirstTimeTooltipsRoot />}
    </div>
  )
}
