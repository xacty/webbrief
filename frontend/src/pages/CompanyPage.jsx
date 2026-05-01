import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Archive, ArrowRight, Trash2 } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import {
  canCreateProjects as canCreateProjectsForRole,
  canInviteMembers,
  canManageProjectLifecycle as canManageProjectLifecycleForRole,
  getInviteRoleOptions,
} from '../lib/roleCapabilities'
import {
  getCompanyRoleLabel as getCompanyRoleLabelShared,
  getPlatformRoleTitle,
} from '../../../shared/userRoles.js'
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

  const canInvite = canInviteMembers(currentUser, company?.membershipRole)
  const canManageProjects = canManageProjectLifecycleForRole(currentUser, company?.membershipRole)
  const canCreateProjects = canCreateProjectsForRole(currentUser, company?.membershipRole)
  const inviteRoles = getInviteRoleOptions(currentUser, company?.membershipRole)

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

  function openProject(projectId) {
    navigate(`/project/${projectId}/editor`)
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
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openProject(projectId)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.breadcrumbs}>
        <button className={styles.backButton} onClick={() => navigate('/companies')}>
          ← Empresas
        </button>
      </div>

      {loading && <p className={styles.info}>Cargando empresa...</p>}
      {!loading && error && <p className={styles.error}>{error}</p>}

      {!loading && company && (
        <>
          <header className={styles.header}>
            <div>
              <div className={styles.titleRow}>
                <h1 className={styles.title}>{company.name}</h1>
                {company.isInternal && <span className={styles.internalBadge}>Interna</span>}
              </div>
              <p className={styles.subtitle}>
                Workspace operativo de la empresa. Aquí viven sus proyectos y su equipo.
              </p>
            </div>
          </header>

          <section className={styles.summary}>
            <article className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Tu rol</span>
              <strong className={styles.summaryValue}>
                {getCompanyRoleLabel(currentUser, company.membershipRole)}
              </strong>
            </article>
            <article className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Proyectos</span>
              <strong className={styles.summaryValue}>{company.projectCount}</strong>
            </article>
            <article className={styles.summaryCard}>
              <span className={styles.summaryLabel}>Equipo</span>
              <strong className={styles.summaryValue}>{company.memberCount}</strong>
            </article>
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
                  <button
                    className={styles.primaryButton}
                    onClick={() => navigate(`/new-project?companyId=${companyId}`)}
                  >
                    + Nuevo proyecto
                  </button>
                )}
              </div>

              {projects.length === 0 ? (
                <div className={styles.emptyState}>
                  <p className={styles.emptyTitle}>Todavía no hay proyectos en esta empresa.</p>
                  <p className={styles.emptyText}>
                    Usa el botón de la sección para crear el primer proyecto dentro de este workspace.
                  </p>
                </div>
              ) : (
                <div className={styles.projectGrid}>
                  {projects.map((project) => (
                    <article
                      key={project.id}
                      className={styles.projectCard}
                      role="button"
                      tabIndex={0}
                      onClick={() => openProject(project.id)}
                      onKeyDown={(event) => handleProjectKeyDown(event, project.id)}
                    >
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
                          <>
                            <button
                              className={styles.trashIconButton}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleProjectTrash(project.id)
                              }}
                              title="Enviar a papelera"
                              aria-label={`Enviar ${project.name} a papelera`}
                            >
                              <Trash2 size={16} />
                            </button>
                            <button
                              className={styles.archiveActionButton}
                              onClick={(event) => {
                                event.stopPropagation()
                                handleProjectArchive(project.id)
                              }}
                              title="Archivar proyecto"
                              aria-label={`Archivar ${project.name}`}
                            >
                              <Archive size={16} />
                            </button>
                          </>
                        )}
                        <button
                          className={styles.openProjectButton}
                          onClick={(event) => {
                            event.stopPropagation()
                            openProject(project.id)
                          }}
                        >
                          <span>Abrir</span>
                          <ArrowRight aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <aside className={styles.teamCard}>
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
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="Nombre completo"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                  />
                  <input
                    className={styles.input}
                    type="email"
                    placeholder="email@empresa.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                  />
                  <select
                    className={styles.input}
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                  >
                    {inviteRoles.map((role) => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                  <button className={styles.primaryButton} type="submit" disabled={inviting}>
                    {inviting ? 'Enviando...' : 'Invitar usuario'}
                  </button>
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
                  <span className={styles.membersCount}>{members.length}</span>
                </div>

                {members.length === 0 ? (
                  <div className={styles.emptyStateCompact}>
                    Aún no hay miembros registrados para esta empresa.
                  </div>
                ) : (
                  <div className={styles.membersList}>
                    {members.map((member) => (
                      <article key={member.userId} className={styles.memberRow}>
                        <div>
                          <p className={styles.memberName}>{member.fullName || 'Sin nombre'}</p>
                          <p className={styles.memberEmail}>{member.email || 'Sin email'}</p>
                        </div>

                        <div className={styles.memberMeta}>
                          <span className={styles.memberRole}>{roleLabel(member.role)}</span>
                          <span className={styles.memberDate}>{formatDate(member.addedAt)}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </div>
  )
}
