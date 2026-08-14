import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
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

function readStoredViewer(token) {
  try {
    return JSON.parse(window.localStorage.getItem(`share-viewer-${token}`)) || null
  } catch {
    return null
  }
}

// Tope de espera por la decisión de acceso (perfil + access check). Si no hay
// veredicto en este plazo, se degrada a la vista anónima (gate) en vez de
// dejar al visitante clavado en "Cargando contenido...".
const ACCESS_DECISION_TIMEOUT_MS = 8000

// Deep-links (`?p=<pageId>&s=<sectionId>`) — el share renderiza todas las
// páginas apiladas, así que "activar" una página es hacer scroll a su bloque.
// Los divisores de sección están ocultos por CSS (`.content [data-section-divider]`),
// y un elemento display:none no tiene rect: el ancla real es el primer hermano
// visible después del divisor.
const SHARE_SCROLL_SPY_OFFSET = 120
const SHARE_FLASH_MS = 1200

function findSharePageBlock(pageId) {
  if (!pageId) return null
  return Array
    .from(document.querySelectorAll('[data-share-page-id]'))
    .find((el) => el.getAttribute('data-share-page-id') === pageId) || null
}

function findShareSectionAnchor(sectionId) {
  if (!sectionId) return null
  const divider = Array
    .from(document.querySelectorAll('[data-share-page-id] [data-section-id]'))
    .find((el) => el.getAttribute('data-section-id') === sectionId)
  if (!divider) return null
  let node = divider.nextElementSibling
  while (node) {
    if (node.getBoundingClientRect().height > 0) return node
    node = node.nextElementSibling
  }
  return divider.parentElement || null
}

export default function SharePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Capturado una sola vez al montar: la URL se reescribe con el scroll y el
  // destino inicial no debe moverse con ella.
  const deepLinkRef = useRef({ pageId: searchParams.get('p'), sectionId: searchParams.get('s') })
  const deepLinkDoneRef = useRef(false)
  const [visiblePageId, setVisiblePageId] = useState('')
  const [scrollSpyReady, setScrollSpyReady] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const { isAuthenticated, realCurrentUser, rolePreview, loading: authLoading } = useAuth()
  const [project, setProject] = useState(null)
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState(() => readStoredViewer(token))
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
  const [decisionTimedOut, setDecisionTimedOut] = useState(false)

  // El componente NO se desmonta al navegar entre /share/tokenA y /share/tokenB:
  // toda decisión previa (auto-identify, redirect, timeout, viewer del gate)
  // debe resetearse para el nuevo token.
  useEffect(() => {
    setAuthViewer(null)
    setRedirecting(false)
    setDecisionTimedOut(false)
    const stored = readStoredViewer(token)
    setViewer(stored)
    setName(stored?.name || '')
    setEmail(stored?.email || '')
  }, [token])

  // Logout con la página abierta: el viewer derivado de la sesión deja de
  // tener sentido; se vuelve al flujo anónimo.
  useEffect(() => {
    if (!isAuthenticated && authViewer) setAuthViewer(null)
  }, [isAuthenticated, authViewer])

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
    // Esperar la hidratación del perfil (/api/auth/me): sin ella no se puede
    // evaluar el role-preview de admin ni construir el viewer auto-identificado
    // (nombre/email vacíos sin salida). authLoading resuelve antes que el perfil.
    if (!realCurrentUser) return

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

  // Red de seguridad: si el perfil o el access check nunca resuelven (red
  // colgada, /api/auth/me caído), tras el timeout se degrada a la vista
  // anónima con gate en vez de bloquear en "Cargando contenido...".
  const waitingAccessDecision = effectiveAuthenticated && Boolean(project?.id)
    && !authViewer && !redirecting && !decisionTimedOut
  useEffect(() => {
    if (!waitingAccessDecision) return undefined
    const id = window.setTimeout(() => setDecisionTimedOut(true), ACCESS_DECISION_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [waitingAccessDecision])

  const effectiveViewer = authViewer || viewer
  const isAutoIdentified = Boolean(authViewer)
  const hasSharedContent = Boolean(effectiveViewer) && pages.length > 0

  // ── Deep-link: scroll + flash una sola vez, cuando el contenido ya está en el DOM ──
  useEffect(() => {
    if (!hasSharedContent || deepLinkDoneRef.current) return undefined
    const { pageId, sectionId } = deepLinkRef.current
    if (!pageId && !sectionId) {
      deepLinkDoneRef.current = true
      setScrollSpyReady(true)
      return undefined
    }

    let attempts = 0
    let timer = null
    const tick = () => {
      if (deepLinkDoneRef.current) return
      const target = findShareSectionAnchor(sectionId) || findSharePageBlock(pageId)
      if (target) {
        deepLinkDoneRef.current = true
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        // Clase global (styles/base.css) — ver comentario allí sobre el
        // renombrado de animation-name en CSS modules.
        target.classList.add('wb-section-flash')
        window.setTimeout(() => target.classList.remove('wb-section-flash'), SHARE_FLASH_MS)
        // El spy arranca recién cuando el scroll suave terminó, para no
        // reescribir `?p` con las páginas por las que pasa en el camino.
        window.setTimeout(() => setScrollSpyReady(true), 900)
        return
      }
      attempts += 1
      if (attempts >= 12) {
        // Página o sección inexistente: silencio, se queda donde está.
        deepLinkDoneRef.current = true
        setScrollSpyReady(true)
        return
      }
      timer = window.setTimeout(tick, 120)
    }

    timer = window.setTimeout(tick, 60)
    return () => { if (timer) window.clearTimeout(timer) }
  }, [hasSharedContent])

  // ── Página visible: alimenta "Copiar enlace" y la sincronización de `?p` ──
  useEffect(() => {
    if (!hasSharedContent) return undefined
    let raf = null
    const sync = () => {
      raf = null
      const blocks = Array.from(document.querySelectorAll('[data-share-page-id]'))
      if (blocks.length === 0) return
      let currentId = blocks[0].getAttribute('data-share-page-id')
      blocks.forEach((el) => {
        if (el.getBoundingClientRect().top <= SHARE_SCROLL_SPY_OFFSET) {
          currentId = el.getAttribute('data-share-page-id')
        }
      })
      setVisiblePageId((prev) => (prev === currentId ? prev : currentId))
    }
    const onScroll = () => { if (!raf) raf = window.requestAnimationFrame(sync) }

    sync()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [hasSharedContent])

  // `replace` para no ensuciar el historial; `s` se limpia solo cuando la
  // página cambia respecto de la que traía la URL.
  useEffect(() => {
    if (!scrollSpyReady || !visiblePageId) return
    const currentPageParam = searchParams.get('p')
    if (currentPageParam === visiblePageId) return
    const next = new URLSearchParams(searchParams)
    next.set('p', visiblePageId)
    if (currentPageParam) next.delete('s')
    setSearchParams(next, { replace: true })
  }, [scrollSpyReady, visiblePageId, searchParams, setSearchParams])

  const handleCopyShareLink = useCallback(async () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('s')
    if (visiblePageId) url.searchParams.set('p', visiblePageId)
    try {
      await navigator.clipboard?.writeText?.(url.toString())
      setCopiedLink(true)
      window.setTimeout(() => setCopiedLink(false), 2000)
    } catch {
      // noop
    }
  }, [visiblePageId])

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
  const stillResolving = loading || authLoading || redirecting || waitingAccessDecision

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
          {hasSharedContent && (
            <Button
              variant="ghost"
              size="md"
              onClick={handleCopyShareLink}
              aria-label="Copiar enlace a esta posición"
            >
              {copiedLink ? 'Enlace copiado' : 'Copiar enlace'}
            </Button>
          )}
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
              <section key={page.id} className={styles.pageBlock} data-share-page-id={page.id}>
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
