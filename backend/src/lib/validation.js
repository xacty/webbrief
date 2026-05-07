export const INPUT_LIMITS = {
  publicName: 120,
  email: 254,
  comment: 3_000,
  shortText: 200,
  answersBytes: 100_000,
  answerKeys: 100,
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PUBLIC_TOKEN_RE = /^[A-Za-z0-9_-]{20,128}$/
const SAFE_ID_RE = /^[A-Za-z0-9._:-]{1,160}$/

export function normalizeText(value, maxLength = INPUT_LIMITS.shortText) {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, maxLength)
}

export function normalizeEmail(value) {
  const email = normalizeText(value, INPUT_LIMITS.email).toLowerCase()
  return EMAIL_RE.test(email) ? email : ''
}

export function isValidPublicToken(value) {
  return PUBLIC_TOKEN_RE.test(String(value || ''))
}

export function normalizeOptionalSafeId(value) {
  if (value === null || value === undefined || value === '') return null
  const normalized = normalizeText(String(value), 160)
  return SAFE_ID_RE.test(normalized) ? normalized : null
}

export function validateAnswersPayload(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return { ok: false, error: 'answers debe ser un objeto' }
  }

  const keys = Object.keys(answers)
  if (keys.length > INPUT_LIMITS.answerKeys) {
    return { ok: false, error: 'answers tiene demasiados campos' }
  }

  if (keys.some((key) => String(key).length > INPUT_LIMITS.shortText)) {
    return { ok: false, error: 'answers contiene campos inválidos' }
  }

  const bytes = Buffer.byteLength(JSON.stringify(answers), 'utf8')
  if (bytes > INPUT_LIMITS.answersBytes) {
    return { ok: false, error: 'answers es demasiado grande' }
  }

  return { ok: true }
}
