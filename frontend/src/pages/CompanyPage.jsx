import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, Building2, Pencil, Trash2, Plus, UserPlus, Users, Mail, FolderPlus, Activity } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import {
  canCreateProjects as canCreateProjectsForRole,
  canInviteMembers,
  canManageProjectLifecycle as canManageProjectLifecycleForRole,
  canSendAccess,
  getInviteRoleOptions,
  isAdmin,
} from '../lib/roleCapabilities'
import {
  ADMIN_ASSIGNABLE_COMPANY_ROLE_ORDER,
  MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER,
  getCompanyRoleLabel as getCompanyRoleLabelShared,
  getCompanyRoleRank,
  getPlatformRoleTitle,
} from '../../../shared/userRoles.js'
import { Button, Input, Select, Modal, Badge, KebabMenu } from '../components/ui'
import UserEditModal from '../components/users/UserEditModal'
import MoveToCompanyModal from '../components/MoveToCompanyModal'
import { sendAccess as sendAccessRequest } from '../lib/sendAccessClient'
import EmptyState from '../components/onboarding/EmptyState'
import styles from './CompanyPage.module.css'

function getCompanyCacheKey(companyId) {
  return `webrief:company:${companyId}`
}

function readCompanyCache(companyId) {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(getCompanyCacheKey(companyId)))
    if (!cached?.company) return null
    return cached
  } catch {
    return null
  }
}

function writeCompanyCache(companyId, payload) {
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

function clearCompaniesCache() {
  try {
    window.sessionStorage.removeItem('webrief:companies')
  } catch {
    // Ignore storage failures; network data still renders.
  }
}

function formatDate(isoDate) {
  if (!isoDate) return 'Sin actividad'

  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatRelativeDate(isoDate) {
  if (!isoDate) return 'sin actividad'
  const now = new Date()
  const then = new Date(isoDate)
  const diffMs = now - then
  const diffMin = Math.round(diffMs / 60000)
  const diffH = Math.round(diffMs / 3600000)
  const diffD = Math.round(diffMs / 86400000)
  if (diffMin < 1) return 'hace instantes'
  if (diffMin < 60) return `hace ${diffMin} min`
  if (diffH < 24) return `hace ${diffH} h`
  if (diffD === 1) return 'ayer'
  if (diffD < 7) return `hace ${diffD} días`
  if (diffD < 30) return `hace ${Math.round(diffD / 7)} semanas`
  return `el ${formatDate(isoDate)}`
}

function getCompanyRoleLabel(currentUser, membershipRole) {
  if (currentUser?.platformRole === 'admin') return getPlatformRoleTitle(currentUser.platformRole)
  return getCompanyRoleLabelShared(membershipRole)
}

function roleLabel(role) {
  return getCompanyRoleLabelShared(role)
}

function getInitials(fullName, email) {
  const source = (fullName && fullName.trim()) || (email && email.split('@')[0]) || ''
  if (!source) return '?'
  const parts = source.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getRoleBadgeVariant(role) {
  // company-admin is the highest in-company rank (PR 3) — give it a
  // distinct accent so it reads above 'manager' at a glance. Workers
  // (editor, content_writer, designer, developer) stay neutral.
  if (role === 'admin') return 'warning'
  if (role === 'manager') return 'primary'
  return 'neutral'
}

// Compact breakdown line for the Miembros header (PR 3). Renders as
// "1 admin · 2 managers · 3 editores · 1 colaborador" — order is fixed
// regardless of insertion order so the line stays scannable.
function buildMembersCounter(members) {
  const counts = members.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1
    return acc
  }, {})
  const parts = []
  if (counts.admin)   parts.push(`${counts.admin} ${counts.admin === 1 ? 'admin' : 'admins'}`)
  if (counts.manager) parts.push(`${counts.manager} ${counts.manager === 1 ? 'manager' : 'managers'}`)
  if (counts.editor)  parts.push(`${counts.editor} ${counts.editor === 1 ? 'editor' : 'editores'}`)
  const workerCount = (counts.content_writer || 0) + (counts.designer || 0) + (counts.developer || 0)
  if (workerCount)    parts.push(`${workerCount} ${workerCount === 1 ? 'colaborador' : 'colaboradores'}`)
  return parts.join(' · ')
}

// TEMP demo members for visual preview when the list is empty. They render
// as the list view but the kebab is hidden so they can't be edited (the
// fake userIds would 404 against the real API). Disappear automatically as
// soon as a real member is invited.
const DEMO_MEMBERS = [
  {
    userId: 'demo-am',
    fullName: 'Ana Martinez',
    email: 'ana.martinez@empresa.com',
    role: 'manager',
    addedAt: '2026-03-12T10:00:00Z',
    _demo: true,
  },
  {
    userId: 'demo-jl',
    fullName: 'Juan Lopez',
    email: 'juan.lopez@empresa.com',
    role: 'editor',
    addedAt: '2026-04-22T10:00:00Z',
    _demo: true,
  },
  {
    userId: 'demo-ps',
    fullName: 'Pedro Sanchez',
    email: 'p.sanchez@empresa.com',
    role: 'editor',
    addedAt: '2026-05-18T10:00:00Z',
    _demo: true,
  },
]

function projectTypeLabel(projectType) {
  if (projectType === 'document') return 'Artículo'
  if (projectType === 'faq') return 'FAQs'
  if (projectType === 'brief') return 'Brief'
  return 'Página Web'
}

export default function CompanyPage() {
  const navigate = useNavigate()
  const { companyId } = useParams()
  const { currentUser } = useAuth()
  const cachedCompany = readCompanyCache(companyId)
  const [company, setCompany] = useState(() => cachedCompany?.company || null)
  const [projects, setProjects] = useState(() => cachedCompany?.projects || [])
  const [members, setMembers] = useState(() => cachedCompany?.members || [])
  const [loading, setLoading] = useState(() => !cachedCompany?.company)
  const [error, setError] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('editor')
  const [inviteFeedback, setInviteFeedback] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteModalOpen, setInviteModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  // editForm/editError/editBusy removed — <UserEditModal/> (PR 2) owns
  // its own form state, validation, and submit lifecycle.
  const [moveModalIds, setMoveModalIds] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [feedbackNotice, setFeedbackNotice] = useState('')
  const [activeTab, setActiveTab] = useState('proyectos')
  const [activity, setActivity] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)

  const canInvite = canInviteMembers(currentUser, company?.membershipRole)
  const canManageProjects = canManageProjectLifecycleForRole(currentUser, company?.membershipRole)
  const canCreateProjects = canCreateProjectsForRole(currentUser, company?.membershipRole)
  const inviteRoles = getInviteRoleOptions(currentUser, company?.membershipRole)
  const isAdminUser = isAdmin(currentUser)
  const isCompanyManager = company?.membershipRole === 'manager'

  // Rank-aware peer rule (PR 3): you can manage anyone STRICTLY below you
  // in the company rank ladder (admin > manager > editor > worker peers).
  // Platform admin still bypasses the ladder.
  const actorCompanyRank = getCompanyRoleRank(company?.membershipRole)
  function canManageMember(member) {
    if (!member) return false
    if (isAdminUser) return true
    if (!actorCompanyRank) return false
    return actorCompanyRank > getCompanyRoleRank(member.role)
  }

  function getMemberRoleOptions(member) {
    // company-admin assigns from the full set (incl. another 'admin');
    // managers can only assign from the worker tier (PR 3 contract,
    // mirrors backend rank check). Platform admin uses the admin list.
    if (isAdminUser || company?.membershipRole === 'admin') {
      return ADMIN_ASSIGNABLE_COMPANY_ROLE_ORDER
    }
    const baseOptions = MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER
    return member && baseOptions.includes(member.role)
      ? baseOptions
      : member?.role
        ? [member.role, ...baseOptions.filter((role) => role !== member.role)]
        : baseOptions
  }

  useEffect(() => {
    let active = true
    const cached = readCompanyCache(companyId)

    if (cached?.company) {
      setCompany(cached.company)
      setProjects(cached.projects || [])
      setMembers(cached.members || [])
      setLoading(false)
      setError('')
    } else {
      setCompany(null)
      setProjects([])
      setMembers([])
      setLoading(true)
    }

    async function loadCompany() {
      try {
        const data = await apiFetch(`/api/companies/${companyId}`)
        if (!active) return
        setCompany(data.company)
        setProjects(data.projects)
        setMembers(data.members)
        writeCompanyCache(companyId, data)
        setError('')
      } catch (err) {
        if (!active) return
        setError(err.message || 'No se pudo cargar la empresa')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadCompany()

    return () => {
      active = false
    }
  }, [companyId])

  useEffect(() => {
    setInviteFeedback('')
    setInviteRole((current) => (inviteRoles.includes(current) ? current : inviteRoles[0] || 'editor'))
  }, [currentUser, companyId, inviteRoles])

  useEffect(() => {
    if (activeTab !== 'actividad' || !companyId) return
    let active = true
    setActivityLoading(true)

    apiFetch(`/api/companies/${companyId}/activity`)
      .then((data) => {
        if (active) setActivity(data.activity ?? [])
      })
      .catch(() => {
        if (active) setActivity([])
      })
      .finally(() => {
        if (active) setActivityLoading(false)
      })

    return () => { active = false }
  }, [activeTab, companyId])

  // ESC clears multiselect; do not consume ESC when no selection is active
  // so other components (modals, kebab menus) keep their own ESC handling.
  useEffect(() => {
    if (selectedIds.size === 0) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      // Avoid stealing ESC from open modals (Modal primitive listens too)
      if (moveModalIds || editingMember) return
      event.stopPropagation()
      clearSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedIds, moveModalIds, editingMember])

  async function handleInvite(e) {
    e.preventDefault()
    setInviteFeedback('')
    setInviting(true)

    try {
      const data = await apiFetch('/api/auth/invite-user', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          fullName: inviteName,
          role: inviteRole,
          companyId,
        }),
      })

      const invitedMember = {
        userId: data.invitedUser.id,
        fullName: data.invitedUser.fullName,
        email: data.invitedUser.email,
        role: data.invitedUser.role,
        addedAt: new Date().toISOString(),
      }
      const nextMembers = [invitedMember, ...members]
      const nextCompany = company ? { ...company, memberCount: nextMembers.length } : company

      setMembers(nextMembers)
      setCompany(nextCompany)
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects, members: nextMembers })
      setInviteName('')
      setInviteEmail('')
      setInviteFeedback('')
      setInviteModalOpen(false)
      showFeedback('Invitación enviada correctamente.')
    } catch (err) {
      setInviteFeedback(err.message || 'No se pudo enviar la invitación')
    } finally {
      setInviting(false)
    }
  }

  function openInviteModal() {
    setInviteFeedback('')
    setInviteModalOpen(true)
  }

  function closeInviteModal() {
    if (inviting) return
    setInviteModalOpen(false)
    setInviteFeedback('')
  }

  async function handleSendAccess(member) {
    if (member._demo) {
      showFeedback('Demo: invitá a un miembro real para probar esta acción.')
      return
    }
    const label = member.fullName || member.email
    // sendAccessClient (PR 3) wraps the endpoint with structured error
    // handling — rate-limit returns kind='rate_limited' instead of
    // throwing, so we can show a friendly message without an inline
    // try/catch + err.status check.
    const targetUser = { id: member.userId, email: member.email, companies: [{ companyId }] }
    const result = await sendAccessRequest(targetUser)
    if (result.ok || result.kind === 'rate_limited') {
      showFeedback(result.message || `Email de acceso enviado a ${label}`)
    } else {
      showFeedback(result.message || 'No se pudo enviar acceso')
    }
  }

  async function handleRemoveMember(member) {
    if (member._demo) {
      showFeedback('Demo: invitá a un miembro real para probar esta acción.')
      return
    }
    const label = member.fullName || member.email
    if (!window.confirm(
      `¿Eliminar a ${label} de esta empresa? Perderá acceso a todos los proyectos del workspace.`
    )) return

    try {
      await apiFetch(
        `/api/users/${member.userId}/memberships/${companyId}`,
        { method: 'DELETE' }
      )
      const nextMembers = members.filter((m) => m.userId !== member.userId)
      const nextCompany = company
        ? { ...company, memberCount: nextMembers.length }
        : company
      setMembers(nextMembers)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) {
        writeCompanyCache(companyId, { company: nextCompany, projects, members: nextMembers })
      }
      showFeedback(`${label} eliminado de la empresa`)
    } catch (err) {
      showFeedback(err?.message || 'No se pudo eliminar al miembro')
    }
  }

  function openEditMember(member) {
    if (member?._demo) {
      showFeedback('Demo: invitá a un miembro real para editarlo.')
      return
    }
    setEditingMember(member)
  }

  // Called by <UserEditModal/> after a successful PATCH. We get the
  // updated fields and merge them into our local member row + cache,
  // so the row reflects the change without re-fetching the company.
  function handleMemberSaved(updates) {
    if (!editingMember) return
    const nextMembers = members.map((existing) => (
      existing.userId === editingMember.userId
        ? {
            ...existing,
            fullName: updates.fullName ?? existing.fullName,
            role: (updates.companyRoles && updates.companyRoles[companyId]) || updates.role || existing.role,
          }
        : existing
    ))
    setMembers(nextMembers)
    if (company) writeCompanyCache(companyId, { company, projects, members: nextMembers })
  }

  function openProject(projectId) {
    navigate(`/project/${projectId}/editor`)
  }

  function openMoveModal(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return
    setMoveModalIds(ids)
  }

  function closeMoveModal() {
    setMoveModalIds(null)
  }

  function handleMoveSuccess({ moved, failed, targetCompany }) {
    const movedIds = new Set(Array.isArray(moveModalIds) ? moveModalIds : [])
    const nextProjects = projects.filter((project) => !movedIds.has(project.id))
    const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company
    setProjects(nextProjects)
    setCompany(nextCompany)
    clearCompaniesCache()
    if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
    if (selectedIds.size > 0) clearSelection()

    const dest = targetCompany?.name ? `Movidos a ${targetCompany.name}` : `${moved} proyecto(s) movidos`
    const failedCount = Array.isArray(failed) ? failed.length : 0
    showFeedback(failedCount > 0 ? `${dest} (${failedCount} no procesado(s))` : dest)
  }

  function showFeedback(message) {
    setFeedbackNotice(message)
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setFeedbackNotice(''), 4000)
    }
  }

  function toggleSelected(projectId) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  function selectAllProjects() {
    setSelectedIds(new Set(projects.map((project) => project.id)))
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleBulkArchive() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`¿Archivar ${ids.length} proyecto(s)? Podrás restaurarlos desde Archivados.`)) return
    setBulkBusy(true)
    try {
      const result = await apiFetch('/api/projects/bulk/archive', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      const archived = Number(result?.archived || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      const nextProjects = projects.filter((project) => !selectedIds.has(project.id))
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company
      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
      clearSelection()
      showFeedback(failed > 0
        ? `${archived} proyecto(s) archivado(s); ${failed} no procesado(s)`
        : `${archived} proyecto(s) archivado(s)`)
    } catch (err) {
      setError(err.message || 'No se pudieron archivar los proyectos')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleBulkTrash() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (!window.confirm(`¿Enviar ${ids.length} proyecto(s) a papelera?`)) return
    setBulkBusy(true)
    try {
      const result = await apiFetch('/api/projects/bulk/trash', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      })
      const trashed = Number(result?.trashed || 0)
      const failed = Array.isArray(result?.failed) ? result.failed.length : 0
      const nextProjects = projects.filter((project) => !selectedIds.has(project.id))
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company
      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
      clearSelection()
      showFeedback(failed > 0
        ? `${trashed} proyecto(s) enviados a papelera; ${failed} no procesado(s)`
        : `${trashed} proyecto(s) enviados a papelera`)
    } catch (err) {
      setError(err.message || 'No se pudieron enviar a papelera')
    } finally {
      setBulkBusy(false)
    }
  }

  async function handleProjectDuplicate(projectId) {
    try {
      const data = await apiFetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' })
      const newProject = data.project
      const nextProjects = [...projects, newProject]
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company
      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
    } catch (err) {
      setError(err.message || 'No se pudo duplicar el proyecto')
    }
  }

  async function handleProjectArchive(projectId) {
    if (!window.confirm('¿Archivar este proyecto? Podrás restaurarlo desde la papelera operativa más adelante.')) return
    try {
      await apiFetch(`/api/projects/${projectId}/archive`, { method: 'POST' })
      const nextProjects = projects.filter((project) => project.id !== projectId)
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company

      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
    } catch (err) {
      setError(err.message || 'No se pudo archivar el proyecto')
    }
  }

  async function handleProjectTrash(projectId) {
    if (!window.confirm('¿Enviar este proyecto a papelera por 30 días?')) return
    try {
      await apiFetch(`/api/projects/${projectId}/trash`, { method: 'POST' })
      const nextProjects = projects.filter((project) => project.id !== projectId)
      const nextCompany = company ? { ...company, projectCount: nextProjects.length } : company

      setProjects(nextProjects)
      setCompany(nextCompany)
      clearCompaniesCache()
      if (nextCompany) writeCompanyCache(companyId, { company: nextCompany, projects: nextProjects, members })
    } catch (err) {
      setError(err.message || 'No se pudo enviar el proyecto a papelera')
    }
  }

  // In select-mode (≥1 selected), clicking/Enter on the card toggles its
  // selection instead of opening the project. Explicit buttons (Abrir,
  // Duplicar, kebab) still perform their action via stopPropagation.
  function handleProjectActivate(projectId) {
    if (selectedIds.size > 0) {
      toggleSelected(projectId)
    } else {
      openProject(projectId)
    }
  }

  function handleProjectKeyDown(event, projectId) {
    if (event.target.closest?.('button')) return
    if (event.target.closest?.('input, label, [role="menu"]')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleProjectActivate(projectId)
    }
  }

  return (
    <div className={styles.page}>
      {loading && <p className={styles.info}>Cargando empresa...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}

      {!loading && company && (
        <>
          <header className={styles.pageHeader}>
            <div className={styles.pageHeaderInner}>
              <nav className={styles.breadcrumb} aria-label="Migas de pan">
                <button
                  type="button"
                  className={styles.breadcrumbLink}
                  onClick={() => navigate('/companies')}
                >
                  Empresas
                </button>
                <span className={styles.breadcrumbSep} aria-hidden="true">/</span>
                <span className={styles.breadcrumbCurrent} aria-current="page">
                  {company.name}
                </span>
              </nav>

              <div className={styles.titleRow}>
                <div className={styles.headerMain}>
                  <div className={styles.titleLine}>
                    <h1 className={styles.title}>{company.name}</h1>
                    {company.isInternal && <Badge variant="neutral" size="sm">Interna</Badge>}
                  </div>
                  <div className={styles.headerMeta}>
                    <span>{company.projectCount} proyecto{company.projectCount === 1 ? '' : 's'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{company.memberCount} miembro{company.memberCount === 1 ? '' : 's'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{getCompanyRoleLabel(currentUser, company.membershipRole)}</span>
                  </div>
                </div>
                {canCreateProjects && (
                  <Button
                    variant="primary"
                    icon={<Plus size={16} />}
                    onClick={() => navigate(`/new-project?companyId=${companyId}`)}
                  >
                    Proyecto
                  </Button>
                )}
              </div>

              <div className={styles.tabBar} role="tablist">
                {['proyectos', 'equipo', 'actividad'].map((tab) => (
                  <button
                    key={tab}
                    role="tab"
                    aria-selected={activeTab === tab}
                    className={activeTab === tab ? `${styles.tab} ${styles.tabActive}` : styles.tab}
                    onClick={() => setActiveTab(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </header>

          <div className={styles.pageBody}>

          {/* Tab panels */}
          <div role="tabpanel" hidden={activeTab !== 'proyectos'} className={styles.tabPanel}>
            <section className={styles.projectsSection}>
              {canManageProjects && selectedIds.size > 0 && (
                <div className={styles.bulkToolbar} role="toolbar" aria-label="Acciones masivas">
                  <div className={styles.bulkInfo}>
                    <strong>{selectedIds.size} proyecto{selectedIds.size === 1 ? '' : 's'} seleccionado{selectedIds.size === 1 ? '' : 's'}</strong>
                    {selectedIds.size < projects.length ? (
                      <button
                        type="button"
                        className={styles.bulkLink}
                        onClick={selectAllProjects}
                      >
                        Seleccionar todos ({projects.length})
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.bulkLink}
                        onClick={clearSelection}
                      >
                        Deseleccionar todos
                      </button>
                    )}
                  </div>
                  <div className={styles.bulkActions}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<Archive size={14} />}
                      onClick={handleBulkArchive}
                      disabled={bulkBusy}
                    >
                      Archivar
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<Building2 size={14} />}
                      onClick={() => openMoveModal(Array.from(selectedIds))}
                      disabled={bulkBusy}
                    >
                      Mover de empresa
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      icon={<Trash2 size={14} />}
                      onClick={handleBulkTrash}
                      disabled={bulkBusy}
                    >
                      Enviar a papelera
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSelection}
                      disabled={bulkBusy}
                    >
                      Cancelar ({selectedIds.size})
                    </Button>
                  </div>
                </div>
              )}

              {feedbackNotice && (
                <div className={styles.feedbackNotice} role="status">
                  {feedbackNotice}
                </div>
              )}

              {projects.length === 0 ? (
                <EmptyState
                  icon={FolderPlus}
                  title="Todavía no hay proyectos en esta empresa"
                  body="Crea el primero para empezar a colaborar con tu equipo y compartir avances con clientes."
                  cta={canCreateProjects ? {
                    label: 'Nuevo proyecto',
                    onClick: () => navigate(`/new-project?companyId=${companyId}`),
                  } : null}
                />
              ) : (
                <div className={styles.projectGrid}>
                  {projects.map((project) => {                    const isSelected = selectedIds.has(project.id)
                    const inSelectMode = selectedIds.size > 0
                    const cardClassNames = [styles.projectCard]
                    if (isSelected) cardClassNames.push(styles.projectCardSelected)
                    if (inSelectMode) cardClassNames.push(styles.projectCardInSelectMode)
                    return (
                    <article
                      key={project.id}
                      className={cardClassNames.join(' ')}
                      role="button"
                      tabIndex={0}
                      aria-selected={isSelected ? 'true' : undefined}
                      onClick={() => handleProjectActivate(project.id)}
                      onKeyDown={(event) => handleProjectKeyDown(event, project.id)}
                    >
                      {canManageProjects && (
                        <label
                          className={styles.projectSelectLabel}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            className={styles.projectSelectCheckbox}
                            checked={isSelected}
                            onChange={() => toggleSelected(project.id)}
                            aria-label={isSelected ? `Deseleccionar ${project.name}` : `Seleccionar ${project.name}`}
                          />
                        </label>
                      )}

                      <div className={styles.projectTop}>
                        <span className={styles.projectTypeChip}>
                          {projectTypeLabel(project.projectType)}
                        </span>
                      </div>

                      <div className={styles.projectBody}>
                        <h3 className={styles.projectName}>{project.name}</h3>
                        <p className={styles.projectTimestamp}>
                          Editado {formatRelativeDate(project.lastActivity)}
                        </p>
                      </div>

                      <div className={styles.projectActions}>
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation()
                            openProject(project.id)
                          }}
                        >
                          Abrir
                        </Button>
                        {canManageProjects && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={(event) => {
                              event.stopPropagation()
                              handleProjectDuplicate(project.id)
                            }}
                          >
                            Duplicar
                          </Button>
                        )}
                        {canManageProjects && (
                          <div
                            className={styles.projectKebabSlot}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <KebabMenu
                              label={`Más acciones de ${project.name}`}
                              placement="top-end"
                              items={[
                                {
                                  label: 'Mover de empresa',
                                  icon: <Building2 size={14} />,
                                  onClick: () => openMoveModal([project.id]),
                                },
                                {
                                  label: 'Archivar',
                                  icon: <Archive size={14} />,
                                  onClick: () => handleProjectArchive(project.id),
                                },
                                {
                                  label: 'Enviar a papelera',
                                  icon: <Trash2 size={14} />,
                                  destructive: true,
                                  onClick: () => handleProjectTrash(project.id),
                                },
                              ]}
                            />
                          </div>
                        )}
                      </div>
                    </article>
                  )
                  })}
                  {canCreateProjects && (
                    <button
                      type="button"
                      className={styles.addProjectCard}
                      onClick={() => navigate(`/new-project?companyId=${companyId}`)}
                    >
                      <Plus size={20} />
                      <span>Nuevo proyecto</span>
                    </button>
                  )}
                </div>
              )}
            </section>
          </div>

          <div role="tabpanel" hidden={activeTab !== 'equipo'} className={styles.tabPanel}>
            {(() => {
              const displayMembers = members.length > 0 ? members : DEMO_MEMBERS
              return (
            <section className={styles.membersSection}>
              <div className={styles.membersHeader}>
                <div>
                  <h2 className={styles.membersTitle}>
                    Miembros <span className={styles.membersCount}>· {displayMembers.length}</span>
                  </h2>
                  {displayMembers.length > 0 && (() => {
                    const counter = buildMembersCounter(displayMembers)
                    return counter ? <p className={styles.membersCounter}>{counter}</p> : null
                  })()}
                </div>
                {canInvite && displayMembers.length > 0 && (
                  <Button
                    variant="primary"
                    size="md"
                    icon={<UserPlus size={16} />}
                    onClick={openInviteModal}
                  >
                    Invitar miembro
                  </Button>
                )}
              </div>

              {displayMembers.length === 0 ? (
                <EmptyState
                  icon={UserPlus}
                  title={canInvite ? 'Invita a tu primer colaborador' : 'Esta empresa aún no tiene miembros'}
                  body={canInvite
                    ? 'Asigna roles para que cada persona vea solo lo que necesita. Tú sigues siendo Manager.'
                    : 'Cuando se agreguen miembros aparecerán aquí.'}
                  cta={canInvite ? {
                    label: 'Invitar miembro',
                    onClick: openInviteModal,
                  } : null}
                />
              ) : (
                <div className={styles.membersList}>
                  {displayMembers.map((member) => {
                    const memberManageable = canManageMember(member)
                    return (
                      <div key={member.userId} className={styles.memberRow}>
                        <div className={styles.memberAvatar} aria-hidden="true">
                          {getInitials(member.fullName, member.email)}
                        </div>
                        <div className={styles.memberInfo}>
                          <p className={styles.memberName}>{member.fullName || 'Sin nombre'}</p>
                          <p className={styles.memberEmail}>{member.email || 'Sin email'}</p>
                        </div>
                        <Badge variant={getRoleBadgeVariant(member.role)} size="sm">
                          {roleLabel(member.role)}
                        </Badge>
                        <time className={styles.memberDate}>
                          {formatRelativeDate(member.addedAt)}
                        </time>
                        {memberManageable ? (
                          <KebabMenu
                            label={`Acciones de ${member.fullName || member.email}`}
                            placement="bottom-end"
                            items={[
                              {
                                label: 'Editar miembro',
                                icon: <Pencil size={14} />,
                                onClick: () => openEditMember(member),
                              },
                              // PR 3: gate "Reenviar acceso" via canSendAccess
                              // capability — mirrors the backend rank check so
                              // managers can't try to send access to peers and
                              // hit a 403 mid-action.
                              ...(member.userId !== currentUser?.id ? [
                                ...(canSendAccess(currentUser, { id: member.userId, companies: [{ companyId }] }) ? [{
                                  label: 'Reenviar acceso',
                                  icon: <Mail size={14} />,
                                  onClick: () => handleSendAccess(member),
                                }] : []),
                                {
                                  label: 'Eliminar del workspace',
                                  icon: <Trash2 size={14} />,
                                  destructive: true,
                                  onClick: () => handleRemoveMember(member),
                                },
                              ] : []),
                            ]}
                          />
                        ) : (
                          <span className={styles.memberKebabPlaceholder} aria-hidden="true" />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </section>
              )
            })()}
          </div>

          <div role="tabpanel" hidden={activeTab !== 'actividad'} className={styles.tabPanel}>
            {activityLoading ? (
              <p className={styles.info}>Cargando actividad...</p>
            ) : activity.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="Sin actividad registrada"
                body="La actividad de los proyectos de esta empresa aparecerá aquí."
              />
            ) : (
              <ol className={styles.activityList}>
                {activity.map((event) => (
                  <li key={event.id} className={styles.activityItem}>
                    <span className={styles.activityType}>{event.event_type}</span>
                    <time
                      className={styles.activityDate}
                      dateTime={event.created_at}
                    >
                      {formatDate(event.created_at)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </div>
          </div>
        </>
      )}

      {/* Shared UserEditModal (PR 2) — scope='company' shows just the
          single-company role select + name + (admin only) email field,
          and embeds PasswordSection / SessionsList (PR 4) for the
          target user. Replaces the prior inline edit form. */}
      <UserEditModal
        open={Boolean(editingMember)}
        user={editingMember && {
          id: editingMember.userId,
          email: editingMember.email,
          fullName: editingMember.fullName,
          platformRole: editingMember.platformRole || 'user',
          avatarUrl: editingMember.avatarUrl || null,
          companies: [{
            companyId,
            companyName: company?.name || '',
            companySlug: company?.slug || '',
            role: editingMember.role,
          }],
        }}
        currentUser={currentUser}
        scope="company"
        companyId={companyId}
        onClose={() => setEditingMember(null)}
        onSaved={handleMemberSaved}
      />

      <MoveToCompanyModal
        open={Boolean(moveModalIds && moveModalIds.length > 0)}
        ids={moveModalIds || []}
        currentCompanyId={companyId}
        isAdmin={isAdminUser}
        onClose={closeMoveModal}
        onSuccess={handleMoveSuccess}
      />

      <Modal
        open={inviteModalOpen}
        onClose={closeInviteModal}
        title="Invitar miembro"
        size="md"
      >
        <p className={styles.modalSubtitle}>
          El usuario recibirá un correo con el link para activar su cuenta.
        </p>

        <form className={styles.inviteForm} onSubmit={handleInvite}>
          <div className={styles.inviteRow}>
            <Input
              id="invite-email"
              label="Email del invitado"
              type="email"
              placeholder="persona@empresa.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              required
              autoFocus
            />
            <Select
              id="invite-role"
              label="Rol"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            >
              {inviteRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </Select>
          </div>

          <Input
            id="invite-name"
            label="Nombre (opcional)"
            type="text"
            placeholder="Nombre completo"
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
          />

          {inviteFeedback && <p className={styles.modalError}>{inviteFeedback}</p>}

          <div className={styles.modalActions}>
            <Button type="button" variant="ghost" onClick={closeInviteModal} disabled={inviting}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={inviting} loading={inviting}>
              {inviting ? 'Enviando...' : 'Enviar invitación'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
