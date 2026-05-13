import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Button, Input, Card } from '../components/ui'
import styles from './BriefPage.module.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000'

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.error || `Error ${res.status}`)
  return data
}

function FileUploadField({ question, value, onChange, token }) {
  const files = Array.isArray(value) ? value : []
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return
    setUploadError('')
    setUploading(true)
    const next = [...files]
    for (const file of fileList) {
      try {
        const form = new FormData()
        form.append('file', file)
        const response = await fetch(`${API_BASE}/api/public/brief/${token}/documents`, {
          method: 'POST',
          body: form,
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || `Error ${response.status}`)
        next.push({
          id: data.asset.id,
          fileName: data.asset.fileName,
          mimeType: data.asset.mimeType,
          fileSize: data.asset.fileSize,
          publicUrl: data.asset.publicUrl,
        })
      } catch (err) {
        setUploadError(err.message || 'No se pudo subir el archivo')
        break
      }
    }
    onChange(next)
    setUploading(false)
  }

  function removeFile(id) {
    onChange(files.filter((f) => f.id !== id))
  }

  return (
    <div className={styles.fieldGroup}>
      <label className={styles.questionLabel}>
        {question.label}
        {question.required && <span className={styles.required} aria-hidden="true"> *</span>}
      </label>
      {question.hint && <p className={styles.hint}>{question.hint}</p>}
      <input
        type="file"
        multiple
        className={styles.fileInput}
        onChange={(e) => handleFiles(e.target.files)}
        disabled={uploading}
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv,image/*"
      />
      {uploading && <p className={styles.hint}>Subiendo…</p>}
      {uploadError && <p className={styles.uploadError}>{uploadError}</p>}
      {files.length > 0 && (
        <ul className={styles.fileList}>
          {files.map((f) => (
            <li key={f.id} className={styles.fileItem}>
              <span className={styles.fileName}>
                {f.fileName} <span className={styles.kbSize}>· {Math.round((f.fileSize || 0) / 1024)} KB</span>
              </span>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => removeFile(f.id)}
                aria-label={`Quitar archivo ${f.fileName}`}
                className={styles.removeFile}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function QuestionField({ question, value, onChange, token }) {
  const { type, label, hint, required, options } = question

  if (type === 'file_upload') {
    return <FileUploadField question={question} value={value} onChange={onChange} token={token} />
  }

  if (type === 'section_header') {
    return (
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionHeaderTitle}>{label}</h2>
      </div>
    )
  }

  if (type === 'short_text') {
    return (
      <div className={styles.fieldGroup}>
        <label className={styles.questionLabel}>
          {label}
          {required && <span className={styles.required} aria-hidden="true"> *</span>}
        </label>
        {hint && <p className={styles.hint}>{hint}</p>}
        <Input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          aria-label={label}
        />
      </div>
    )
  }

  if (type === 'long_text') {
    return (
      <div className={styles.fieldGroup}>
        <label className={styles.questionLabel}>
          {label}
          {required && <span className={styles.required} aria-hidden="true"> *</span>}
        </label>
        {hint && <p className={styles.hint}>{hint}</p>}
        <textarea
          className={styles.textarea}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          aria-required={required ? 'true' : undefined}
          aria-label={label}
          rows={4}
        />
      </div>
    )
  }

  if (type === 'single_choice') {
    return (
      <div className={styles.fieldGroup}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.questionLabel}>
            {label}
            {required && <span className={styles.required} aria-hidden="true"> *</span>}
          </legend>
          {hint && <p className={styles.hint}>{hint}</p>}
          <div className={styles.optionsList}>
            {(options || []).map((option) => (
              <label key={option} className={styles.optionLabel}>
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  required={required}
                  className={styles.optionInput}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    )
  }

  if (type === 'multiple_choice') {
    const selected = Array.isArray(value) ? value : []
    const toggle = (option) => {
      if (selected.includes(option)) onChange(selected.filter((o) => o !== option))
      else onChange([...selected, option])
    }
    return (
      <div className={styles.fieldGroup}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.questionLabel}>
            {label}
            {required && <span className={styles.required} aria-hidden="true"> *</span>}
          </legend>
          {hint && <p className={styles.hint}>{hint}</p>}
          <div className={styles.optionsList}>
            {(options || []).map((option) => (
              <label key={option} className={styles.optionLabel}>
                <input
                  type="checkbox"
                  value={option}
                  checked={selected.includes(option)}
                  onChange={() => toggle(option)}
                  className={styles.optionInput}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    )
  }

  return null
}

export default function BriefPage() {
  const { token } = useParams()
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [respondentName, setRespondentName] = useState('')
  const [respondentEmail, setRespondentEmail] = useState('')
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    async function loadBrief() {
      try {
        const data = await apiFetch(`/api/public/brief/${token}`)
        setBrief(data.brief)
      } catch (err) {
        setError(err.message || 'No se pudo cargar el brief')
      } finally {
        setLoading(false)
      }
    }
    loadBrief()
  }, [token])

  function setAnswer(questionId, value) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitError('')

    // Validate required questions
    const requiredQuestions = (brief?.questions || []).filter(
      (q) => q.required && q.type !== 'section_header'
    )
    for (const q of requiredQuestions) {
      const val = answers[q.id]
      const empty = val === undefined || val === null || val === ''
        || (Array.isArray(val) && val.length === 0)
      if (empty) {
        setSubmitError(`Por favor responde: "${q.label}"`)
        return
      }
    }

    setSubmitting(true)
    try {
      await apiFetch(`/api/public/brief/${token}/submit`, {
        method: 'POST',
        body: JSON.stringify({ respondentName, respondentEmail, answers }),
      })
      setSubmitted(true)
    } catch (err) {
      setSubmitError(err.message || 'No se pudo enviar el formulario')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <p className={styles.loadingText}>Cargando brief...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <Card padding="lg" shadow="sm" radius="md" className={styles.errorState}>
            <h1 className={styles.errorTitle}>Brief no disponible</h1>
            <p className={styles.errorText}>{error}</p>
          </Card>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <Card padding="lg" shadow="sm" radius="md" className={styles.successState}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.successTitle}>¡Gracias por completar el brief!</h1>
            <p className={styles.successText}>
              Tu información fue recibida correctamente. El equipo se pondrá en contacto contigo pronto.
            </p>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <header className={styles.formHeader}>
          <h1 className={styles.formTitle}>{brief.formTitle}</h1>
          {brief.formDescription && (
            <p className={styles.formDescription}>{brief.formDescription}</p>
          )}
          <p className={styles.requiredNote}>Los campos marcados con * son obligatorios.</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          {/* Respondent identity */}
          <Card padding="md" shadow="sm" radius="md" className={styles.identityCard}>
            <h2 className={styles.identityTitle}>Tus datos</h2>
            <div className={styles.identityGrid}>
              <Input
                type="text"
                label="Nombre completo"
                required
                placeholder="Tu nombre"
                value={respondentName}
                onChange={(e) => setRespondentName(e.target.value)}
                autoComplete="name"
              />
              <Input
                type="email"
                label="Correo electrónico"
                required
                placeholder="tu@email.com"
                value={respondentEmail}
                onChange={(e) => setRespondentEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
          </Card>

          {/* Questions */}
          <div className={styles.questionsList}>
            {(brief.questions || []).map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.id]}
                onChange={(val) => setAnswer(question.id, val)}
                token={token}
              />
            ))}
          </div>

          {submitError && <p className={styles.submitError}>{submitError}</p>}

          <div className={styles.submitRow}>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              disabled={submitting}
              loading={submitting}
            >
              {submitting ? 'Enviando...' : 'Enviar brief'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
