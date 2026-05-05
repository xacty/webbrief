import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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
    if (!viewer) return
    setSubmitting(true)
    setFeedback('')

    try {
      await publicFetch(`/api/public/share/${token}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          authorName: viewer.name,
          authorEmail: viewer.email,
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
    if (!viewer) return
    setSubmitting(true)
    setFeedback('')

    try {
      await publicFetch(`/api/public/share/${token}/approvals`, {
        method: 'POST',
        body: JSON.stringify({
          reviewerName: viewer.name,
          reviewerEmail: viewer.email,
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

  if (loading) return <div className={styles.state}>Cargando contenido...</div>
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
        <button className={styles.secondaryButton} onClick={() => window.print()}>
          Exportar PDF
        </button>
      </header>

      {!viewer && (
        <form className={styles.identityCard} onSubmit={handleIdentify}>
          <h2 className={styles.cardTitle}>Identifícate para comentar o aprobar</h2>
          <div className={styles.identityGrid}>
            <label className={styles.field}>
              Nombre
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label className={styles.field}>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit">Continuar</button>
        </form>
      )}

      {viewer && (
        <>
          <aside className={styles.feedbackPanel}>
            <div>
              <p className={styles.viewerText}>Comentando como {viewer.name} · {viewer.email}</p>
              <button className={styles.linkButton} onClick={clearViewer}>Cambiar datos</button>
            </div>

            <form className={styles.feedbackForm} onSubmit={submitComment}>
              <label className={styles.field}>
                Comentario
                <textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} required />
              </label>
              <button className={styles.secondaryButton} type="submit" disabled={submitting}>
                Enviar comentario
              </button>
            </form>

            <div className={styles.approvalBox}>
              <label className={styles.field}>
                Nota de aprobación o cambios
                <textarea value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} rows={2} />
              </label>
              <div className={styles.actions}>
                <button className={styles.primaryButton} type="button" disabled={submitting} onClick={() => submitApproval('approved')}>
                  Aprobar
                </button>
                <button className={styles.dangerButton} type="button" disabled={submitting} onClick={() => submitApproval('changes_requested')}>
                  Pedir cambios
                </button>
              </div>
            </div>

            {feedback && <p className={styles.feedback}>{feedback}</p>}
          </aside>

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
