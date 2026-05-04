import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
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

function QuestionField({ question, value, onChange }) {
  const { type, label, hint, required, options } = question

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
          {required && <span className={styles.required}> *</span>}
        </label>
        {hint && <p className={styles.hint}>{hint}</p>}
        <input
          className={styles.input}
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      </div>
    )
  }

  if (type === 'long_text') {
    return (
      <div className={styles.fieldGroup}>
        <label className={styles.questionLabel}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
        {hint && <p className={styles.hint}>{hint}</p>}
        <textarea
          className={styles.textarea}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          required={required}
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
            {required && <span className={styles.required}> *</span>}
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
            {required && <span className={styles.required}> *</span>}
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
          <div className={styles.errorState}>
            <h1 className={styles.errorTitle}>Brief no disponible</h1>
            <p className={styles.errorText}>{error}</p>
          </div>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.successState}>
            <div className={styles.successIcon}>✓</div>
            <h1 className={styles.successTitle}>¡Gracias por completar el brief!</h1>
            <p className={styles.successText}>
              Tu información fue recibida correctamente. El equipo se pondrá en contacto contigo pronto.
            </p>
          </div>
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
          <div className={styles.identityCard}>
            <h2 className={styles.identityTitle}>Tus datos</h2>
            <div className={styles.identityGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.questionLabel}>
                  Nombre completo<span className={styles.required}> *</span>
                </label>
                <input
                  className={styles.input}
                  type="text"
                  value={respondentName}
                  onChange={(e) => setRespondentName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="Tu nombre"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.questionLabel}>
                  Correo electrónico<span className={styles.required}> *</span>
                </label>
                <input
                  className={styles.input}
                  type="email"
                  value={respondentEmail}
                  onChange={(e) => setRespondentEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="tu@email.com"
                />
              </div>
            </div>
          </div>

          {/* Questions */}
          <div className={styles.questionsList}>
            {(brief.questions || []).map((question) => (
              <QuestionField
                key={question.id}
                question={question}
                value={answers[question.id]}
                onChange={(val) => setAnswer(question.id, val)}
              />
            ))}
          </div>

          {submitError && <p className={styles.submitError}>{submitError}</p>}

          <div className={styles.submitRow}>
            <button
              className={styles.submitButton}
              type="submit"
              disabled={submitting}
            >
              {submitting ? 'Enviando...' : 'Enviar brief'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
