import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, Building2, Trash2, Plus, FolderPlus } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { apiFetch } from '../../lib/api'
import { getCompanyCacheKey, readCompanyCache, writeCompanyCache, clearCompaniesCache } from '../../lib/companyCache'
import {
  canCreateProjects as canCreateProjectsForRole,
  canManageProjectLifecycle as canManageProjectLifecycleForRole,
  isAdmin,
} from '../../lib/roleCapabilities'
import { getCompanyRoleLabel as getCompanyRoleLabelShared, getPlatformRoleTitle } from '../../../../shared/userRoles.js'
import { Button, Badge, KebabMenu } from '../../components/ui'
import MoveToCompanyModal from '../../components/MoveToCompanyModal'
import EmptyState from '../../components/onboarding/EmptyState'
import styles from '../CompanyPage.module.css'

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

function projectTypeLabel(projectType) {
  if (projectType === 'document') return 'Artículo'
  if (projectType === 'faq') return 'FAQs'
  if (projectType === 'brief') return 'Brief'
  return 'Página Web'
}

export default function ProjectsPage() {
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const { currentCompany, refresh: refreshWorkspace } = useWorkspace()
  const companyId = currentCompany?.id

  const cachedCompany = companyId ? readCompanyCache(companyId) : null
  const [company, setCompany] = useState(() => cachedCompany?.company || null)
  const [projects, setProjects] = useState(() => cachedCompany?.projects || [])
  const [members, setMembers] = useState(() => cachedCompany?.members || [])
  const [loading, setLoading] = useState(() => !cachedCompany?.company)
  const [error, setError] = useState('')
  const [moveModalIds, setMoveModalIds] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [feedbackNotice, setFeedbackNotice] = useState('')

  const canManageProjects = canManageProjectLifecycleForRole(currentUser, company?.membershipRole)
  const canCreateProjects = canCreateProjectsForRole(currentUser, company?.membershipRole)
  const isAdminUser = isAdmin(currentUser)

  useEffect(() => {
    if (!companyId) {
      setCompany(null)
      setProjects([])
      setMembers([])
      setLoading(false)
      return undefined
    }

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

  // ESC clears multiselect; do not consume ESC when no selection is active
  // so other components (modals, kebab menus) keep their own ESC handling.
  useEffect(() => {
    if (selectedIds.size === 0) return undefined
    function onKeyDown(event) {
      if (event.key !== 'Escape') return
      // Avoid stealing ESC from open modals (Modal primitive listens too)
      if (moveModalIds) return
      event.stopPropagation()
      clearSelection()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selectedIds, moveModalIds])

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
    // Fire-and-forget: keep the sidebar switcher's projectCount in sync.
    refreshWorkspace()

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
      // Fire-and-forget: refresh sidebar switcher projectCount.
      refreshWorkspace()
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
      // Fire-and-forget: refresh sidebar switcher projectCount.
      refreshWorkspace()
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
      // Fire-and-forget: refresh sidebar switcher projectCount.
      refreshWorkspace()
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
      // Fire-and-forget: refresh sidebar switcher projectCount.
      refreshWorkspace()
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
      // Fire-and-forget: refresh sidebar switcher projectCount.
      refreshWorkspace()
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

  // Workspace not resolved yet — nothing meaningful to render.
  if (!currentCompany) return null

  return (
    <div className={styles.page}>
      {loading && <p className={styles.info}>Cargando empresa...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}

      {!loading && company && (
        <>
          <header className={styles.pageHeader}>
            <div className={styles.pageHeaderInner}>
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
            </div>
          </header>

          <div className={styles.pageBody}>
            <div className={styles.tabPanel}>
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
          </div>
        </>
      )}

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
