import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronUp, Copy, Link, Plus, Trash2, X, ArrowLeft } from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useAuth } from '../auth/AuthContext'
import styles from './BriefProjectEditor.module.css'

// ── Constants ────────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS = {
  section_header: 'Encabezado de sección',
  short_text: 'Texto corto',
  long_text: 'Texto largo',
  single_choice: 'Opción única',
  multiple_choice: 'Selección múltiple',
  file_upload: 'Archivos adjuntos',
}

const ADD_QUESTION_TYPES = [
  'section_header',
  'short_text',
  'long_text',
  'single_choice',
  'multiple_choice',
  'file_upload',
]

const VITE_API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeQuestion(type = 'short_text') {
  return {
    id: crypto.randomUUID(),
    type,
    label: '',
    hint: '',
    required: type !== 'section_header',
    options: [],
  }
}

function optionsToText(options = []) {
  return (options || []).join('\n')
}

function textToOptions(text = '') {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ── Question editor ───────────────────────────────────────────────────────────

function QuestionEditor({ question, index, total, onChange, onRemove, onMoveUp, onMoveDown }) {
  const hasOptions = question.type === 'single_choice' || question.type === 'multiple_choice'

  return (
    <div className={`${styles.questionCard} ${question.type === 'section_header' ? styles.questionCardSection : ''}`}>
      <div className={styles.questionCardTop}>
        <span className={styles.questionIndex}>{index + 1}</span>
        <select
          className={styles.typeSelect}
          value={question.type}
          onChange={(e) => onChange({ ...question, type: e.target.value, options: [] })}
        >
          {ADD_QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>{QUESTION_TYPE_LABELS[t]}</option>
          ))}
        </select>
        <div className={styles.questionCardActions}>
          <button
            className={styles.iconBtn}
            onClick={() => onMoveUp(index)}
            disabled={index === 0}
            title="Subir"
            aria-label="Subir pregunta"
            type="button"
          >
            <ChevronUp size={15} />
          </button>
          <button
            className={styles.iconBtn}
            onClick={() => onMoveDown(index)}
            disabled={index === total - 1}
            title="Bajar"
            aria-label="Bajar pregunta"
            type="button"
          >
            <ChevronDown size={15} />
          </button>
          <button
            className={`${styles.iconBtn} ${styles.iconBtnDestructive}`}
            onClick={() => onRemove(index)}
            title="Eliminar"
            aria-label="Eliminar pregunta"
            type="button"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className={styles.questionFields}>
        <input
          className={styles.fieldInput}
          type="text"
          placeholder={question.type === 'section_header' ? 'Título de sección' : 'Enunciado de la pregunta'}
          value={question.label}
          onChange={(e) => onChange({ ...question, label: e.target.value })}
        />
        {question.type !== 'section_header' && (
          <>
            <input
              className={styles.fieldInput}
              type="text"
              placeholder="Pista o aclaración (opcional)"
              value={question.hint || ''}
              onChange={(e) => onChange({ ...question, hint: e.target.value })}
            />
            <label className={styles.requiredToggle}>
              <input
                type="checkbox"
                checked={!!question.required}
                onChange={(e) => onChange({ ...question, required: e.target.checked })}
              />
              <span>Obligatoria</span>
            </label>
          </>
        )}
        {hasOptions && (
          <div className={styles.optionsField}>
            <p className={styles.optionsLabel}>Opciones (una por línea)</p>
            <textarea
              className={styles.optionsTextarea}
              rows={4}
              value={optionsToText(question.options)}
              onChange={(e) => onChange({ ...question, options: textToOptions(e.target.value) })}
              placeholder="Opción A&#10;Opción B&#10;Opción C"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Template save panel ───────────────────────────────────────────────────────

function TemplateSavePanel({ companyId, formTitle, formDescription, questions }) {
  const [templateName, setTemplateName] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState('')

  async function handleSave(e) {
    e.preventDefault()
    const trimmed = templateName.trim()
    if (!trimmed || !companyId) return
    setSaving(true)
    setFeedback('')
    try {
      const structureJson = [{ formTitle, formDescription, questions }]
      await apiFetch(`/api/companies/${companyId}/templates`, {
        method: 'POST',
        body: JSON.stringify({ name: trimmed, projectType: 'brief', structureJson }),
      })
      setTemplateName('')
      setFeedback('Plantilla guardada.')
      window.setTimeout(() => setFeedback(''), 3000)
    } catch (err) {
      setFeedback(err.message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className={styles.sideCard}>
      <h2 className={styles.sideCardTitle}>Guardar como plantilla</h2>
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          className={styles.templateInput}
          type="text"
          placeholder="Nombre de la plantilla"
          value={templateName}
          onChange={(e) => setTemplateName(e.target.value)}
        />
        <button
          className={styles.generateBtn}
          type="submit"
          disabled={saving || !templateName.trim()}
        >
          {saving ? 'Guardando...' : 'Guardar estructura actual'}
        </button>
      </form>
      {feedback && <p className={styles.sideNote} style={{ color: feedback.startsWith('No') ? '#dc2626' : '#16a34a' }}>{feedback}</p>}
      <p className={styles.sideNote}>La plantilla queda disponible al crear nuevos Briefs en esta empresa.</p>
    </div>
  )
}

// ── Share panel ───────────────────────────────────────────────────────────────

function SharePanel({ projectId, initialToken }) {
  const [token, setToken] = useState(initialToken || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const publicUrl = token
    ? `${window.location.origin}/b/${token}`
    : null

  async function handleGenerate() {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch(`/api/projects/${projectId}/brief/share`, { method: 'POST' })
      setToken(data.token)
    } catch (err) {
      setError(err.message || 'No se pudo generar el link')
    } finally {
      setLoading(false)
    }
  }

  async function handleRevoke() {
    if (!window.confirm('¿Revocar el link? Los clientes que ya tengan el enlace no podrán acceder.')) return
    setLoading(true)
    setError('')
    try {
      await apiFetch(`/api/projects/${projectId}/brief/share`, { method: 'DELETE' })
      setToken(null)
    } catch (err) {
      setError(err.message || 'No se pudo revocar el link')
    } finally {
      setLoading(false)
    }
  }

  async function handleCopy() {
    if (!publicUrl) return
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  return (
    <div className={styles.sideCard}>
      <h2 className={styles.sideCardTitle}>
        <Link size={16} aria-hidden="true" />
        Link público
      </h2>

      {publicUrl ? (
        <>
          <div className={styles.linkRow}>
            <span className={styles.linkText}>{publicUrl}</span>
            <button className={styles.copyBtn} onClick={handleCopy} type="button" title="Copiar link">
              {copied ? <span className={styles.copiedBadge}>✓</span> : <Copy size={14} />}
            </button>
          </div>
          <button
            className={styles.revokeBtn}
            onClick={handleRevoke}
            disabled={loading}
            type="button"
          >
            {loading ? 'Revocando...' : 'Revocar link'}
          </button>
        </>
      ) : (
        <button
          className={styles.generateBtn}
          onClick={handleGenerate}
          disabled={loading}
          type="button"
        >
          {loading ? 'Generando...' : 'Generar link de envío'}
        </button>
      )}
      {error && <p className={styles.sideError}>{error}</p>}
      <p className={styles.sideNote}>
        Comparte este link con tu cliente para que rellene el formulario. Las respuestas aparecerán abajo.
      </p>
    </div>
  )
}

// ── Responses panel ───────────────────────────────────────────────────────────

function ResponsesPanel({ projectId, questions }) {
  const [responses, setResponses] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    apiFetch(`/api/projects/${projectId}/brief/responses`)
      .then((data) => {
        if (active) setResponses(data.responses || [])
      })
      .catch((err) => {
        if (active) setError(err.message || 'No se pudieron cargar las respuestas')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [projectId])

  const questionMap = Object.fromEntries((questions || []).map((q) => [q.id, q]))

  return (
    <div className={styles.sideCard}>
      <h2 className={styles.sideCardTitle}>Respuestas</h2>

      {loading && <p className={styles.sideNote}>Cargando...</p>}
      {error && <p className={styles.sideError}>{error}</p>}

      {!loading && responses !== null && responses.length === 0 && (
        <p className={styles.sideNote}>Aún no hay respuestas recibidas.</p>
      )}

      {!loading && responses && responses.length > 0 && (
        <div className={styles.responsesList}>
          {responses.map((response) => (
            <div key={response.id} className={styles.responseItem}>
              <button
                className={styles.responseHeader}
                onClick={() => setExpanded((prev) => (prev === response.id ? null : response.id))}
                type="button"
              >
                <div className={styles.responseHeaderInfo}>
                  <span className={styles.responseName}>{response.respondent_name || 'Sin nombre'}</span>
                  <span className={styles.responseEmail}>{response.respondent_email || ''}</span>
                </div>
                <div className={styles.responseHeaderMeta}>
                  <span className={styles.responseDate}>{formatDate(response.submitted_at)}</span>
                  {expanded === response.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>
              </button>

              {expanded === response.id && (
                <div className={styles.responseBody}>
                  {Object.entries(response.answers || {}).map(([qId, answer]) => {
                    const q = questionMap[qId]
                    if (!q || q.type === 'section_header') return null
                    const answerText = Array.isArray(answer) ? answer.join(', ') : (answer || '—')
                    return (
                      <div key={qId} className={styles.responseAnswer}>
                        <p className={styles.responseQuestion}>{q.label}</p>
                        <p className={styles.responseValue}>{answerText}</p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BriefProjectEditor({ projectId, projectMeta, pages }) {
  const navigate = useNavigate()
  const { rolePreview } = useAuth()
  const isPublicPreview = rolePreview === 'public_viewer'
  const [previewToken, setPreviewToken] = useState(null)
  const [previewError, setPreviewError] = useState('')

  useEffect(() => {
    if (!isPublicPreview || !projectId) return
    let active = true
    apiFetch(`/api/projects/${projectId}/brief/share`, { method: 'POST' })
      .then((data) => { if (active) setPreviewToken(data.token) })
      .catch((err) => { if (active) setPreviewError(err.message || 'No se pudo cargar la vista de cliente') })
    return () => { active = false }
  }, [isPublicPreview, projectId])

  // Brief data lives in pages[0].contentJson
  const firstPage = pages?.[0] || null
  const briefData = firstPage?.contentJson || { formTitle: 'Brief', formDescription: '', questions: [] }

  const [formTitle, setFormTitle] = useState(briefData.formTitle || 'Brief')
  const [formDescription, setFormDescription] = useState(briefData.formDescription || '')
  const [questions, setQuestions] = useState(briefData.questions || [])
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState('')
  const [saveError, setSaveError] = useState('')
  const [addingType, setAddingType] = useState(null)

  const saveTimeoutRef = useRef(null)

  // Mark dirty on any question/meta change
  const markDirty = useCallback(() => {
    setIsDirty(true)
    setSaveMessage('')
  }, [])

  function handleFormTitleChange(val) {
    setFormTitle(val)
    markDirty()
  }

  function handleFormDescriptionChange(val) {
    setFormDescription(val)
    markDirty()
  }

  function handleQuestionChange(index, updated) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? updated : q)))
    markDirty()
  }

  function handleQuestionRemove(index) {
    setQuestions((prev) => prev.filter((_, i) => i !== index))
    markDirty()
  }

  function handleMoveUp(index) {
    if (index === 0) return
    setQuestions((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next
    })
    markDirty()
  }

  function handleMoveDown(index) {
    setQuestions((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next
    })
    markDirty()
  }

  function handleAddQuestion(type) {
    setQuestions((prev) => [...prev, makeQuestion(type)])
    setAddingType(null)
    markDirty()
  }

  async function handleSave() {
    if (!isDirty || isSaving || !firstPage) return
    setIsSaving(true)
    setSaveError('')

    const updatedContentJson = { formTitle, formDescription, questions }
    const payload = [{
      id: firstPage.id,
      name: formTitle || 'Brief',
      position: 0,
      contentHtml: '',
      contentJson: updatedContentJson,
    }]

    try {
      await apiFetch(`/api/projects/${projectId}/pages`, {
        method: 'PUT',
        body: JSON.stringify({ pages: payload }),
      })
      setIsDirty(false)
      setSaveMessage('Guardado')
      window.setTimeout(() => setSaveMessage(''), 2500)
    } catch (err) {
      setSaveError(err.message || 'No se pudo guardar')
    } finally {
      setIsSaving(false)
    }
  }

  // Keyboard shortcut: Cmd/Ctrl + S
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDirty, isSaving, firstPage, formTitle, formDescription, questions])

  const companyId = projectMeta?.companyId
  const initialToken = projectMeta?.briefShareToken || null

  if (isPublicPreview) {
    return (
      <div className={styles.root}>
        <header className={styles.navbar}>
          <button
            className={styles.backBtn}
            onClick={() => navigate(companyId ? `/companies/${companyId}` : '/companies')}
            type="button"
            data-wb-tooltip={companyId ? 'Volver a la empresa' : 'Volver a empresas'}
            aria-label="Volver"
          >
            <ArrowLeft size={18} />
          </button>
          <div className={styles.navbarCenter}>
            <span className={styles.navbarProjectName}>{projectMeta?.name || 'Brief'}</span>
            <span className={styles.navbarBadge}>Vista de cliente</span>
          </div>
          <div className={styles.navbarRight}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Estás viendo el brief como lo vería un cliente sin cuenta.
            </span>
          </div>
        </header>
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {previewError ? (
            <div style={{ margin: 'auto', padding: 24, color: '#dc2626' }}>
              {previewError}
            </div>
          ) : !previewToken ? (
            <div style={{ margin: 'auto', padding: 24, color: '#64748b' }}>
              Cargando vista de cliente…
            </div>
          ) : (
            <iframe
              key={previewToken}
              src={`/b/${previewToken}`}
              title="Vista de cliente"
              style={{ flex: 1, border: 0, background: '#fff' }}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.root}>
      {/* ── Navbar ── */}
      <header className={styles.navbar}>
        <button
          className={styles.backBtn}
          onClick={() => navigate(companyId ? `/companies/${companyId}` : '/companies')}
          type="button"
          data-wb-tooltip={companyId ? 'Volver a la empresa' : 'Volver a empresas'}
          aria-label="Volver"
        >
          <ArrowLeft size={18} />
        </button>

        <div className={styles.navbarCenter}>
          <span className={styles.navbarProjectName}>{projectMeta?.name || 'Brief'}</span>
          <span className={styles.navbarBadge}>Brief</span>
        </div>

        <div className={styles.navbarRight}>
          {saveError && <span className={styles.navbarError}>{saveError}</span>}
          {saveMessage && <span className={styles.navbarSaved}>{saveMessage}</span>}
          {isDirty && !isSaving && !saveMessage && (
            <span className={styles.navbarDirty}>Sin guardar</span>
          )}
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            type="button"
          >
            {isSaving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </header>

      {/* ── Body ── */}
      <div className={styles.body}>
        {/* ── Main: brief builder ── */}
        <main className={styles.main}>
          {/* Form metadata */}
          <section className={styles.metaCard}>
            <h2 className={styles.sectionLabel}>Configuración del formulario</h2>
            <div className={styles.metaFields}>
              <div className={styles.metaField}>
                <label className={styles.metaFieldLabel}>Título del formulario</label>
                <input
                  className={styles.metaInput}
                  type="text"
                  value={formTitle}
                  onChange={(e) => handleFormTitleChange(e.target.value)}
                  placeholder="Ej: Brief de Inicio de Proyecto"
                />
              </div>
              <div className={styles.metaField}>
                <label className={styles.metaFieldLabel}>Descripción (opcional)</label>
                <textarea
                  className={styles.metaTextarea}
                  rows={3}
                  value={formDescription}
                  onChange={(e) => handleFormDescriptionChange(e.target.value)}
                  placeholder="Breve texto introductorio que verá el cliente antes de responder."
                />
              </div>
            </div>
          </section>

          {/* Questions */}
          <section className={styles.questionsSection}>
            <div className={styles.questionsSectionHeader}>
              <h2 className={styles.sectionLabel}>
                Preguntas
                <span className={styles.questionCount}>{questions.length}</span>
              </h2>
            </div>

            {questions.length === 0 && (
              <div className={styles.emptyQuestions}>
                <p>Aún no hay preguntas. Agrega la primera usando el botón de abajo.</p>
              </div>
            )}

            <div className={styles.questionsList}>
              {questions.map((question, index) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  index={index}
                  total={questions.length}
                  onChange={(updated) => handleQuestionChange(index, updated)}
                  onRemove={() => handleQuestionRemove(index)}
                  onMoveUp={handleMoveUp}
                  onMoveDown={handleMoveDown}
                />
              ))}
            </div>

            {/* Add question */}
            <div className={styles.addRow}>
              {addingType === null ? (
                <button
                  className={styles.addBtn}
                  onClick={() => setAddingType('picker')}
                  type="button"
                >
                  <Plus size={16} aria-hidden="true" />
                  Agregar pregunta
                </button>
              ) : (
                <div className={styles.typePicker}>
                  {ADD_QUESTION_TYPES.map((type) => (
                    <button
                      key={type}
                      className={styles.typePickerBtn}
                      onClick={() => handleAddQuestion(type)}
                      type="button"
                    >
                      {QUESTION_TYPE_LABELS[type]}
                    </button>
                  ))}
                  <button
                    className={styles.typePickerCancel}
                    onClick={() => setAddingType(null)}
                    type="button"
                    aria-label="Cancelar"
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
            </div>
          </section>
        </main>

        {/* ── Sidebar ── */}
        <aside className={styles.sidebar}>
          <SharePanel projectId={projectId} initialToken={initialToken} />
          <TemplateSavePanel
            companyId={companyId}
            formTitle={formTitle}
            formDescription={formDescription}
            questions={questions}
          />
          <ResponsesPanel projectId={projectId} questions={questions} />
        </aside>
      </div>
    </div>
  )
}
