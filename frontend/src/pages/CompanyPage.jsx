import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowRight, Building2, Copy, Pencil, Trash2, Plus } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import {
  canCreateProjects as canCreateProjectsForRole,
  canInviteMembers,
  canManageProjectLifecycle as canManageProjectLifecycleForRole,
  getInviteRoleOptions,
  isAdmin,
} from '../lib/roleCapabilities'
import {
  COMPANY_ROLE_ORDER,
  MANAGER_ASSIGNABLE_COMPANY_ROLE_ORDER,
  getCompanyRoleLabel as getCompanyRoleLabelShared,
  getPlatformRoleTitle,
} from '../../../shared/userRoles.js'
import { Button, Input, Select, Modal, Card, Badge, KebabMenu } from '../components/ui'
import MoveToCompanyModal from '../components/MoveToCompanyModal'
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

function getCompanyRoleLabel(currentUser, membershipRole) {
  if (currentUser?.platformRole === 'admin') return getPlatformRoleTitle(currentUser.platformRole)
  return getCompanyRoleLabelShared(membershipRole)
}

function roleLabel(role) {
  return getCompanyRoleLabelShared(role)
}

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
  const [editingMember, setEditingMember] = useState(null)
  const [editForm, setEditForm] = useState({ fullName: '', role: 'editor' })
  const [editError, setEditError] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [moveModalIds, setMoveModalIds] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [feedbackNotice, setFeedbackNotice] = useState('')

  const canInvite = canInviteMembers(currentUser, company?.membershipRole)
  const canManageProjects = canManageProjectLifecycleForRole(currentUser, company?.membershipRole)
  const canCreateProjects = canCreateProjectsForRole(currentUser, company?.membershipRole)
  const inviteRoles = getInviteRoleOptions(currentUser, company?.membershipRole)
  const isAdminUser = isAdmin(currentUser)
  const isCompanyManager = company?.membershipRole === 'manager'

  function canManageMember(member) {
    if (!member) return false
    if (isAdminUser) return true
    if (!isCompanyManager) return false
    return member.role !== 'manager'
  }

  function getMemberRoleOptions(member) {
    if (isAdminUser) return COMPANY_ROLE_ORDER
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
      setInviteFeedback('Invitación enviada correctamente.')
    } catch (err) {
      setInviteFeedback(err.message || 'No se pudo enviar la invitación')
    } finally {
      setInviting(false)
    }
  }

  function openEditMember(member) {
    setEditingMember(member)
    setEditForm({
      fullName: member.fullName || '',
      role: member.role || 'editor',
    })
    setEditError('')
  }

  function closeEditMember() {
    setEditingMember(null)
    setEditError('')
  }

  async function handleSaveEditMember(e) {
    e.preventDefault()
    if (!editingMember) return

    const trimmedName = String(editForm.fullName || '').trim()
    const nextRole = editForm.role
    const nameChanged = trimmedName !== (editingMember.fullName || '')
    const roleChanged = nextRole !== editingMember.role

    if (!nameChanged && !roleChanged) {
      closeEditMember()
      return
    }

    setEditBusy(true)
    setEditError('')

    try {
      if (nameChanged) {
        await apiFetch(`/api/users/${editingMember.userId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fullName: trimmedName }),
        })
      }

      if (roleChanged) {
        await apiFetch(`/api/users/${editingMember.userId}/memberships/${companyId}`, {
          method: 'PATCH',
          body: JSON.stringify({ role: nextRole }),
        })
      }

      const nextMembers = members.map((existing) => (
        existing.userId === editingMember.userId
          ? { ...existing, fullName: trimmedName, role: nextRole }
          : existing
      ))
      setMembers(nextMembers)
      if (company) writeCompanyCache(companyId, { company, projects, members: nextMembers })

      closeEditMember()
    } catch (err) {
      setEditError(err.message || 'No se pudo actualizar al miembro')
    } finally {
      setEditBusy(false)
    }
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

  function handleProjectKeyDown(event, projectId) {
    if (event.target.closest?.('button')) return
    if (event.target.closest?.('input, label, [role="menu"]')) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openProject(projectId)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>
        <Button variant="ghost" size="sm" onClick={() => navigate('/companies')}>
          ← Empresas
        </Button>
      </div>

      {loading && <p className={styles.info}>Cargando empresa...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}

      {!loading && company && (
        <>
          <header className={styles.header}>
            <div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{company.name}</h1>
                {company.isInternal && <Badge variant="neutral" size="sm">Interna</Badge>}
              </div>
              <p className={styles.subtitle}>
                Workspace operativo de la empresa. Aquí viven sus proyectos y su equipo.
              </p>
            </div>
          </header>

          <section className={styles.summary}>
            <Card padding="sm" shadow="sm" radius="md" className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Tu rol</span>
              <strong className={styles.summaryValue}>
                {getCompanyRoleLabel(currentUser, company.membershipRole)}
              </strong>
            </Card>
            <Card padding="sm" shadow="sm" radius="md" className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Proyectos</span>
              <strong className={styles.summaryValue}>{company.projectCount}</strong>
            </Card>
            <Card padding="sm" shadow="sm" radius="md" className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Equipo</span>
              <strong className={styles.summaryValue}>{company.memberCount}</strong>
            </Card>
          </section>

          <div className={styles.workspaceGrid}>
            <section className={styles.projectsSection}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Proyectos</h2>
                  <p className={styles.sectionText}>
                    Todos los proyectos de {company.name} viven aquí en cards navegables.
                  </p>
                </div>

                {canCreateProjects && (
                  <Button
                    variant="primary"
                    icon={<Plus size={16} />}
                    onClick={() => navigate(`/new-project?companyId=${companyId}`)}
                  >
                    Nuevo proyecto
                  </Button>
                )}
              </div>

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
                <div className={styles.emptyState}>
                  <p className={styles.emptyTitle}>Todavía no hay proyectos en esta empresa.</p>
                  <p className={styles.emptyText}>
                    Usa el botón de la sección para crear el primer proyecto dentro de este workspace.
                  </p>
                </div>
              ) : (
                <div className={styles.projectGrid}>
                  {projects.map((project) => {
                    const isSelected = selectedIds.has(project.id)
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
                      onClick={() => openProject(project.id)}
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
                        <div>
                          <h3 className={styles.projectName}>{project.name}</h3>
                          <p className={styles.projectClient}>{project.client}</p>
                        </div>
                      </div>

                      <div className={styles.projectMetaList}>
                        <div className={styles.projectMetaRow}>
                          <span className={styles.metaLabel}>Tipo</span>
                          <span className={styles.metaValue}>{projectTypeLabel(project.projectType)}</span>
                        </div>
                        <div className={styles.projectMetaRow}>
                          <span className={styles.metaLabel}>Actividad</span>
                          <span className={styles.metaValue}>{formatDate(project.lastActivity)}</span>
                        </div>
                      </div>

                      <div className={styles.projectActions}>
                        {canManageProjects && (
                          <div
                            className={styles.projectActionsKebab}
                            onClick={(event) => event.stopPropagation()}
                          >
                            <KebabMenu
                              label={`Más acciones de ${project.name}`}
                              placement="top-start"
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
                        <div className={styles.projectActionsButtons}>
                          {canManageProjects && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              icon={<Copy size={14} />}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleProjectDuplicate(project.id)
                              }}
                              title="Duplicar proyecto"
                              aria-label={`Duplicar ${project.name}`}
                            />
                          )}
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            icon={<ArrowRight size={14} />}
                            iconPosition="right"
                            onClick={(event) => {
                              event.stopPropagation()
                              openProject(project.id)
                            }}
                          >
                            Abrir
                          </Button>
                        </div>
                      </div>
                    </article>
                  )
                  })}
                </div>
              )}
            </section>

            <Card as="aside" padding="md" shadow="sm" radius="md" className={styles.teamCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h2 className={styles.sectionTitle}>Equipo</h2>
                  <p className={styles.sectionText}>
                    Miembros actuales e invitación rápida en una sola sidecard.
                  </p>
                </div>
              </div>

              {canInvite ? (
                <form className={styles.inviteForm} onSubmit={handleInvite}>
                  <Input
                    type="text"
                    placeholder="Nombre completo"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                  <Input
                    type="email"
                    placeholder="email@empresa.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                  <Select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    {inviteRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="primary" disabled={inviting} loading={inviting} fullWidth>
                    {inviting ? 'Enviando...' : 'Invitar usuario'}
                  </Button>
                </form>
              ) : (
                <div className={styles.inlineNotice}>
                  Tu rol no puede enviar invitaciones en esta empresa.
                </div>
              )}

              {inviteFeedback && <p className={styles.feedback}>{inviteFeedback}</p>}

              <div className={styles.membersSection}>
                <div className={styles.membersHeader}>
                  <h3 className={styles.membersTitle}>Miembros</h3>
                  <Badge variant="neutral" size="sm">{members.length}</Badge>
                </div>

                {members.length === 0 ? (
                  <div className={styles.emptyStateCompact}>
                    Aún no hay miembros registrados para esta empresa.
                  </div>
                ) : (
                  <div className={styles.membersList}>
                    {members.map((member) => {
                      const memberManageable = canManageMember(member)
                      return (
                        <article key={member.userId} className={styles.memberRow}>
                          <div>
                            <p className={styles.memberName}>{member.fullName || 'Sin nombre'}</p>
                            <p className={styles.memberEmail}>{member.email || 'Sin email'}</p>
                          </div>

                          <div className={styles.memberMeta}>
                            <span className={styles.memberRole}>{roleLabel(member.role)}</span>
                            <span className={styles.memberDate}>{formatDate(member.addedAt)}</span>
                          </div>

                          {memberManageable && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              icon={<Pencil size={16} />}
                              onClick={() => openEditMember(member)}
                              title="Editar miembro"
                              aria-label="Editar miembro"
                            />
                          )}
                        </article>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </>
      )}

      <Modal
        open={Boolean(editingMember)}
        onClose={closeEditMember}
        title="Editar miembro"
        size="md"
        ariaDescribedBy="edit-member-description"
      >
        <p id="edit-member-description" className={styles.modalSubtitle}>
          {isAdminUser ? 'Actualiza el nombre y el rol dentro de la empresa.' : 'Actualiza el nombre y el rol dentro de tu empresa.'}
        </p>

        {editingMember && (
          <form className={styles.modalForm} onSubmit={handleSaveEditMember}>
            <Input
              label="Nombre"
              type="text"
              value={editForm.fullName}
              onChange={(e) => setEditForm((current) => ({ ...current, fullName: e.target.value }))}
              placeholder="Nombre completo"
            />

            <Select
              label={`Rol en ${company?.name || 'empresa'}`}
              value={editForm.role}
              onChange={(e) => setEditForm((current) => ({ ...current, role: e.target.value }))}
            >
              {getMemberRoleOptions(editingMember).map((role) => (
                <option key={role} value={role}>{roleLabel(role)}</option>
              ))}
            </Select>

            <p className={styles.fieldHint}>
              Email: {editingMember.email || 'Sin email'}
            </p>

            {editError && <p className={styles.modalError}>{editError}</p>}

            <div className={styles.modalActions}>
              <Button type="button" variant="secondary" onClick={closeEditMember}>
                Cancelar
              </Button>
              <Button type="submit" variant="primary" disabled={editBusy} loading={editBusy}>
                {editBusy ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <MoveToCompanyModal
        open={Boolean(moveModalIds && moveModalIds.length > 0)}
        ids={moveModalIds || []}
        currentCompanyId={companyId}
        isAdmin={isAdminUser}
        onClose={closeMoveModal}
        onSuccess={handleMoveSuccess}
      />
    </div>
  )
}
