// backend/src/lib/storageQuota.js
// Cuota de almacenamiento por empresa. La cuota cuenta activos + papelera
// (la papelera ocupa storage real hasta purgarse). Regla: se bloquea cuando
// uso actual >= cuota; un único archivo puede "pasarse" (overshoot) porque
// el tamaño post-conversión no se conoce a priori.
import { supabaseAdmin } from './supabase.js'

const DEFAULT_QUOTA_MB = 100
const MB = 1024 * 1024

export function summarizeUsage(rows = []) {
  let activeBytes = 0
  let trashedBytes = 0
  for (const row of rows) {
    const size = Number(row?.file_size)
    if (!Number.isFinite(size) || size <= 0) continue
    if (row?.trashed_at) trashedBytes += size
    else activeBytes += size
  }
  return { usedBytes: activeBytes + trashedBytes, activeBytes, trashedBytes }
}

export function evaluateQuota({ usedBytes = 0, quotaMb = DEFAULT_QUOTA_MB, incomingBytes = 0 } = {}) {
  const normalizedQuota = Number.isFinite(Number(quotaMb)) && Number(quotaMb) > 0
    ? Number(quotaMb)
    : DEFAULT_QUOTA_MB
  const quotaBytes = normalizedQuota * MB
  if (usedBytes >= quotaBytes) {
    return {
      allowed: false,
      code: 'quota_exceeded',
      quotaMb: normalizedQuota,
      usedBytes,
      message: `Espacio lleno: ${Math.round(usedBytes / MB)} de ${normalizedQuota} MB. Libera espacio o vacía la papelera de la biblioteca.`,
    }
  }
  return { allowed: true, quotaMb: normalizedQuota, usedBytes, remainingBytes: quotaBytes - usedBytes }
}

export async function fetchCompanyUsage(companyId) {
  const { data, error } = await supabaseAdmin
    .from('project_assets')
    .select('file_size, trashed_at')
    .eq('company_id', companyId)
  if (error) throw new Error(`No se pudo calcular el uso de almacenamiento: ${error.message}`)
  return summarizeUsage(data || [])
}

export async function checkCompanyStorageQuota(companyId, incomingBytes = 0) {
  const [usage, companyRes] = await Promise.all([
    fetchCompanyUsage(companyId),
    supabaseAdmin.from('companies').select('storage_quota_mb').eq('id', companyId).single(),
  ])
  const quotaMb = companyRes?.data?.storage_quota_mb
  return { ...evaluateQuota({ usedBytes: usage.usedBytes, quotaMb, incomingBytes }), usage }
}
