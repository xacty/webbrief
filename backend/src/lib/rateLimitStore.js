export async function consumePersistentRateLimit({
  key,
  windowMs,
  max,
  blockMs,
  maxBlockMs,
  violationTtlMs,
  progressive,
}) {
  if (process.env.RATE_LIMIT_STORE !== 'supabase') return null

  const { supabaseAdmin } = await import('./supabase.js')
  const { data, error } = await supabaseAdmin.rpc('consume_rate_limit', {
    p_key: key,
    p_window_ms: windowMs,
    p_max: max,
    p_block_ms: blockMs,
    p_max_block_ms: maxBlockMs,
    p_violation_ttl_ms: violationTtlMs,
    p_progressive: progressive,
  })

  if (error) throw error
  return typeof data === 'string' ? JSON.parse(data) : data
}
