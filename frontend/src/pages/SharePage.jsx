import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiFetch } from '../lib/api'
import { Button, Input, Card } from '../components/ui'
import styles from './SharePage.module.css'

function publicFetch(path, options = {}) {
  const headers = new Headers(options.headers || {})
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  return fetch(path, { ...options, headers }).then(async (response) => {
    const text = await response.text()
    const payload = text ? JSON.parse(text) : null
    if (!response.ok) {
      throw new Error(payload?.error || `Request failed with status ${response.status}`)
    }
    return payload
  })
}

export default function SharePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated, realCurrentUser, rolePreview, loading: authLoading } = useAuth()
  const [project, setProject] = useState(null)
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(`share-viewer-${token}`)) || null
    } catch {
      return null
    }
  })
  const [name, setName] = useState(viewer?.name || '')
  const [email, setEmail] = useState(viewer?.email || '')
  const [comment, setComment] = useState('')
  const [approvalComment, setApprovalComment] = useState('')
  const [feedback, setFeedback] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Admin de plataforma navegando con role-preview "Cliente sin cuenta": debe
  // ver el share exactamente como un visitante anónimo (gate, sin redirect).
  const isPublicViewerPreview = rolePreview === 'public_viewer' && realCurrentUser?.platformRole === 'admin'
  const effectiveAuthenticated = isAuthenticated && !isPublicViewerPreview

  // Viewer efímero para usuarios logueados sin acceso al proyecto: NO se
  // persiste a localStorage, y oculta el botón "Cambiar datos".
  const [authViewer, setAuthViewer] = useState(null)
  const [redirecting, setRedirecting] = useState(false)

  useEffect(() => {
    let active = true

    async function loadShare() {
      try {
        setLoading(true)
        const data = await publicFetch(`/api/public/share/${token}`)
        if (!active) return
        setProject(data.project)
        setPages(data.pages)
        setError('')
      } catch (err) {
        if (!active) return
        setError(err.message || 'No se pudo abrir el brief')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadShare()
    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    if (authLoading || !project?.id || !effectiveAuthenticated) return
    if (authViewer || redirecting) return

    let active = true

    apiFetch(`/api/projects/${project.id}/access`)
      .then((data) => {
        if (!active) return
        if (data?.hasAccess) {
          setRedirecting(true)
          navigate(`/project/${project.id}/editor`, { replace: true })
          return
        }
        setAuthViewer({
          name: realCurrentUser?.fullName || realCurrentUser?.email || '',
          email: realCurrentUser?.email || '',
        })
      })
      .catch(() => {
        // Degrade gracefully: nunca bloquear la vista por un fallo del access check.
        if (!active) return
        setAuthViewer({
          name: realCurrentUser?.fullName || realCurrentUser?.email || '',
          email: realCurrentUser?.email || '',
        })
      })

    return () => {
      active = false
    }
  }, [authLoading, effectiveAuthenticated, project?.id, authViewer, redirecting, navigate, realCurrentUser])

  const effectiveViewer = authViewer || viewer
  const isAutoIdentified = Boolean(authViewer)

  function handleIdentify(event) {
    event.preventDefault()
    const nextViewer = { name: name.trim(), email: email.trim().toLowerCase() }
    window.localStorage.setItem(`share-viewer-${token}`, JSON.stringify(nextViewer))
    setViewer(nextViewer)
  }

  function clearViewer() {
    window.localStorage.removeItem(`share-viewer-${token}`)
    setViewer(null)
  }

  async function submitComment(event) {
    event.preventDefault()
    if (!effectiveViewer) return
    setSubmitting(true)
    setFeedback('')

    try {
      await publicFetch(`/api/public/share/${token}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          authorName: effectiveViewer.name,
          authorEmail: effectiveViewer.email,
          body: comment,
        }),
      })
      setComment('')
      setFeedback('Comentario enviado.')
    } catch (err) {
      setFeedback(err.message || 'No se pudo enviar el comentario')
    } finally {
      setSubmitting(false)
    }
  }

  async function submitApproval(status) {
    if (!effectiveViewer) return
    setSubmitting(true)
    setFeedback('')

    try {
      await publicFetch(`/api/public/share/${token}/approvals`, {
        method: 'POST',
        body: JSON.stringify({
          reviewerName: effectiveViewer.name,
          reviewerEmail: effectiveViewer.email,
          status,
          comment: approvalComment,
        }),
      })
      setApprovalComment('')
      setFeedback(status === 'approved' ? 'Aprobación registrada.' : 'Pedido de cambios registrado.')
    } catch (err) {
      setFeedback(err.message || 'No se pudo registrar la respuesta')
    } finally {
      setSubmitting(false)
    }
  }

  // El gate NUNCA debe parpadear antes de un redirect: se mantiene el estado
  // de carga mientras el auth, el fetch público o la decisión de acceso sigan
  // pendientes. La decisión se deriva del estado para cubrir también el frame
  // previo a que el efecto dispare el request.
  const accessDecisionPending = effectiveAuthenticated && Boolean(project?.id) && !authViewer && !redirecting
  const stillResolving = loading || authLoading || redirecting || accessDecisionPending

  if (stillResolving) return <div className={styles.state}>Cargando contenido...</div>
  if (error) return <div className={styles.state}>{error}</div>

  // Frase completa con concordancia de género/número correcta en español.
  const typeHeadings = {
    page: 'Página web compartida',
    document: 'Artículo compartido',
    faq: 'FAQs compartidas',
    brief: 'Brief compartido',
  }
  const heading = typeHeadings[project?.projectType] || 'Contenido compartido'

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>{heading}</p>
          <h1 className={styles.title}>{project?.name}</h1>
          <p className={styles.subtitle}>{project?.clientName}</p>
        </div>
        <div className={styles.printHide}>
          <Button
            variant="secondary"
            size="md"
            onClick={() => window.print()}
            aria-label="Exportar a PDF"
          >
            Exportar PDF
          </Button>
        </div>
      </header>

      {!effectiveViewer && (
        <Card padding="md" shadow="sm" radius="md" className={styles.identityCard}>
          <form onSubmit={handleIdentify}>
            <h2 className={styles.cardTitle}>Identifícate para comentar o aprobar</h2>
            <div className={styles.identityGrid}>
              <Input
                label="Nombre"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                type="email"
                label="Email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <Button type="submit" variant="primary" size="md">
              Continuar
            </Button>
            <p className={styles.loginHint}>
              ¿Ya tienes cuenta?{' '}
              <Link to={`/login?return_to=${encodeURIComponent(`/share/${token}`)}`}>Inicia sesión</Link>
            </p>
          </form>
        </Card>
      )}

      {effectiveViewer && (
        <>
          <Card padding="md" shadow="sm" radius="md" className={styles.feedbackPanel} as="aside">
            <div>
              <p className={styles.viewerText}>Comentando como {effectiveViewer.name} · {effectiveViewer.email}</p>
              {!isAutoIdentified && (
                <Button variant="ghost" size="sm" type="button" onClick={clearViewer}>
                  Cambiar datos
                </Button>
              )}
            </div>

            <form className={styles.feedbackForm} onSubmit={submitComment}>
              <label className={styles.field}>
                Comentario
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} required />
              </label>
              <Button type="submit" variant="secondary" size="md" disabled={submitting}>
                Enviar comentario
              </Button>
            </form>

            <div className={styles.approvalBox}>
              <label className={styles.field}>
                Nota de aprobación o cambios
                <textarea value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} rows={2} />
              </label>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="md"
                  type="button"
                  disabled={submitting}
                  onClick={() => submitApproval('approved')}
                >
                  Aprobar
                </Button>
                <Button
                  variant="danger"
                  size="md"
                  type="button"
                  disabled={submitting}
                  onClick={() => submitApproval('changes_requested')}
                >
                  Pedir cambios
                </Button>
              </div>
            </div>

            {feedback && <p className={styles.feedback}>{feedback}</p>}
          </Card>

          <main className={styles.document}>
            {pages.map((page) => (
              <section key={page.id} className={styles.pageBlock}>
                <h2>{page.name}</h2>
                <div
                  className={styles.content}
                  dangerouslySetInnerHTML={{ __html: page.contentHtml }}
                />
              </section>
            ))}
          </main>
        </>
      )}
    </div>
  )
}
