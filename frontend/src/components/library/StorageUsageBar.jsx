import styles from './StorageUsageBar.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const MB = 1024 * 1024

/**
 * Company storage usage meter shown at the bottom of LibraryPage.
 * Levels: ok (<80%), warn (>=80%), full (100% — uploads blocked server-side
 * by checkCompanyStorageQuota). `usage` is the `{ usedBytes, trashedBytes,
 * quotaMb }` shape returned by GET /api/companies/:id/library.
 */
export default function StorageUsageBar({ usage }) {
  if (!usage) return null

  const quotaMb = usage.quotaMb || 100
  const quotaBytes = quotaMb * MB
  const pct = quotaBytes > 0 ? Math.min(100, Math.round((usage.usedBytes / quotaBytes) * 100)) : 0
  const level = pct >= 100 ? 'full' : pct >= 80 ? 'warn' : 'ok'

  return (
    <div className={styles.wrap} role="status" aria-label="Uso de almacenamiento">
      <div className={styles.track}>
        <div
          className={cx(styles.fill, level === 'warn' && styles.fillWarn, level === 'full' && styles.fillFull)}
          style={{ '--fill-pct': `${pct}%` }}
        />
      </div>
      <span className={styles.label}>
        {Math.round(usage.usedBytes / MB)} de {quotaMb} MB
        {usage.trashedBytes > 0 && ` · ${Math.round(usage.trashedBytes / MB)} MB en papelera`}
      </span>
    </div>
  )
}
