// Pure helpers for the /api/security/blocks endpoint.
//
// aggregateRateLimitBlocks groups raw rate_limit_blocked security_events
// by metadata.key, surfacing the latest violations count + lastBlockedAt
// + total event count per key.
//
// isRateLimitBlockActive computes whether a key is still within its block
// window. blockMs comes from the rateLimiters config registry.

export function aggregateRateLimitBlocks(events) {
  if (!Array.isArray(events)) return []

  const buckets = new Map()
  for (const event of events) {
    const meta = event?.metadata || {}
    const key = meta.key
    if (!key) continue

    const existing = buckets.get(key)
    const created = event.created_at
    if (!existing) {
      buckets.set(key, {
        key,
        limiter: meta.limiter || null,
        lastBlockedAt: created,
        violations: meta.violations || 0,
        retryAfterSeconds: meta.retryAfterSeconds || 0,
        eventCount: 1,
      })
      continue
    }

    existing.eventCount += 1
    if (new Date(created) > new Date(existing.lastBlockedAt)) {
      existing.lastBlockedAt = created
      existing.violations = meta.violations || existing.violations
      existing.retryAfterSeconds = meta.retryAfterSeconds || existing.retryAfterSeconds
      existing.limiter = meta.limiter || existing.limiter
    }
  }

  return Array.from(buckets.values()).sort((a, b) => (
    new Date(b.lastBlockedAt) - new Date(a.lastBlockedAt)
  ))
}

export function isRateLimitBlockActive({ lastBlockedAt, now, blockMs }) {
  if (!lastBlockedAt || !blockMs || blockMs <= 0) return false
  const diff = now.getTime() - new Date(lastBlockedAt).getTime()
  return diff < blockMs
}
