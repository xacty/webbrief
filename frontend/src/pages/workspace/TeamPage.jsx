import { useEffect, useState } from 'react'
import { Pencil, Trash2, UserPlus, Mail } from 'lucide-react'
import { useAuth } from '../../auth/AuthContext'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { apiFetch } from '../../lib/api'
import {
  canInviteMembers,
  canSendAccess,
  getInviteRoleOptions,
  isAdmin,
} from '../../lib/roleCapabilities'
import {
  getCompanyRoleLabel as getCompanyRoleLabelShared,
  getCompanyRoleRank,
  getPlatformRoleTitle,
} from '../../../../shared/userRoles.js'
import { Button, Input, Select, Modal, Badge, KebabMenu } from '../../components/ui'
import UserEditModal from '../../components/users/UserEditModal'
import { sendAccess as sendAccessRequest } from '../../lib/sendAccessClient'
import EmptyState from '../../components/onboarding/EmptyState'
import styles from '../CompanyPage.module.css'

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
  // company-admin is the highest in-company rank — give it a distinct
  // accent so it reads above 'manager' at a glance. Workers (editor,
  // content_writer, designer, developer) stay neutral.
  if (role === 'admin') return 'warning'
  if (role === 'manager') return 'primary'
  return 'neutral'
}

// Compact breakdown line for the Miembros header. Renders as
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

export default function TeamPage() {
  const { currentUser } = useAuth()
  const { currentCompany, refresh: refreshWorkspace } = useWorkspace()
  const companyId = currentCompany?.id

  const cachedCompany = companyId ? readCompanyCache(companyId) : null
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
  const [feedbackNotice, setFeedbackNotice] = useState('')

  const canInvite = canInviteMembers(currentUser, company?.membershipRole)
  const inviteRoles = getInviteRoleOptions(currentUser, company?.membershipRole)
  const isAdminUser = isAdmin(currentUser)

  // Rank-aware peer rule: you can manage anyone STRICTLY below you in the
  // company rank ladder (admin > manager > editor > worker peers).
  // Platform admin still bypasses the ladder.
  const actorCompanyRank = getCompanyRoleRank(company?.membershipRole)
  function canManageMember(member) {
    if (!member) return false
    if (isAdminUser) return true
    if (!actorCompanyRank) return false
    return actorCompanyRank > getCompanyRoleRank(member.role)
  }

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
      setInviteFeedback('')
      setInviteModalOpen(false)
      // Fire-and-forget: keep the sidebar switcher's memberCount in sync.
      refreshWorkspace()
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
      showFeedback('Demo: invita a un miembro real para probar esta acción.')
      return
    }
    const label = member.fullName || member.email
    // sendAccessClient wraps the endpoint with structured error handling —
    // rate-limit returns kind='rate_limited' instead of throwing, so we can
    // show a friendly message without an inline try/catch + err.status check.
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
      showFeedback('Demo: invita a un miembro real para probar esta acción.')
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
      // Fire-and-forget: refresh sidebar switcher memberCount.
      refreshWorkspace()
      showFeedback(`${label} eliminado de la empresa`)
    } catch (err) {
      showFeedback(err?.message || 'No se pudo eliminar al miembro')
    }
  }

  function openEditMember(member) {
    if (member?._demo) {
      showFeedback('Demo: invita a un miembro real para editarlo.')
      return
    }
    setEditingMember(member)
  }

  // Called by <UserEditModal/> after a successful PATCH. We get the updated
  // fields and merge them into our local member row + cache, so the row
  // reflects the change without re-fetching the company.
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

  function showFeedback(message) {
    setFeedbackNotice(message)
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setFeedbackNotice(''), 4000)
    }
  }

  // Workspace not resolved yet — nothing meaningful to render.
  if (!currentCompany) return null

  const displayMembers = members.length > 0 ? members : DEMO_MEMBERS

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
                    <span>{company.memberCount} miembro{company.memberCount === 1 ? '' : 's'}</span>
                    <span aria-hidden="true">·</span>
                    <span>{getCompanyRoleLabel(currentUser, company.membershipRole)}</span>
                  </div>
                </div>
                {canInvite && displayMembers.length > 0 && (
                  <Button
                    variant="primary"
                    icon={<UserPlus size={16} />}
                    onClick={openInviteModal}
                  >
                    Invitar miembro
                  </Button>
                )}
              </div>
            </div>
          </header>

          <div className={styles.pageBody}>
            <div className={styles.tabPanel}>
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
                </div>

                {feedbackNotice && (
                  <div className={styles.feedbackNotice} role="status">
                    {feedbackNotice}
                  </div>
                )}

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
                                // Gate "Reenviar acceso" via canSendAccess
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
            </div>
          </div>
        </>
      )}

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
