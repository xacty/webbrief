// Server-side random password generator.
// Charset excludes visually-confusing characters (0/O/o, 1/l/I) so the
// admin can read the generated password off-screen without ambiguity.

import { randomInt } from 'node:crypto'

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%^&*'
const DEFAULT_LENGTH = 16

/**
 * Generates a cryptographically-strong random password.
 *
 * @param {number} length  Default 16. Minimum 8 (matches Supabase default).
 * @returns {string}
 */
export function generateSecurePassword(length = DEFAULT_LENGTH) {
  const n = Math.max(8, Math.floor(length))
  let result = ''
  for (let i = 0; i < n; i += 1) {
    result += CHARSET[randomInt(0, CHARSET.length)]
  }
  return result
}

// Exported for testing
export const __charset = CHARSET
