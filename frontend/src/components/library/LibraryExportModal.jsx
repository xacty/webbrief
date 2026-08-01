import { useEffect, useId, useState } from 'react'
import { Modal, Button, Input } from '../ui'
import { downloadLibraryExport, trashAssets } from '../../lib/libraryApi'
import styles from './LibraryExportModal.module.css'

function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

const FORMAT_OPTIONS = [
  { value: 'webp', label: 'WebP' },
  { value: 'png', label: 'PNG' },
  { value: 'jpg', label: 'JPG' },
]

const TRASH_AFTER_EXPORT_KEY = 'wb:library:trashAfterExport'

function readTrashAfterExportPref() {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(TRASH_AFTER_EXPORT_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

function writeTrashAfterExportPref(value) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(TRASH_AFTER_EXPORT_KEY, value ? 'true' : 'false')
  } catch {
    // Swallow QuotaExceededError or denial in private modes — same guard as companySlug.js.
  }
}

/**
 * Modal anatomy — ver DESIGN-SYSTEM.md §"Modal anatomy". Segmented control
 * de formato — ver DESIGN-SYSTEM.md §"Segmented control (Tesla-style)".
 *
 * Exporta `ids` como ZIP (downloadLibraryExport, fetch→blob — ver el
 * comentario en libraryApi.js) y, sólo si la descarga resolvió OK y el
 * toggle "Enviar a papelera tras exportar" está activo, encadena
 * trashAssets(companyId, ids) SIN force: si el export falla no se
 * trashea nada; si el export resuelve pero el trash posterior falla, igual
 * cerramos (el archivo ya se descargó) y se lo señalamos al caller vía
 * `trashError` para que muestre un aviso — no hay nada que deshacer acá.
 * No conoce el banner de aviso — LibraryPage arma el mensaje final a partir
 * del resultado crudo que le llega por `onExported`, igual que
 * MoveToFolderModal/EmptyTrashModal.
 */
export default function LibraryExportModal({ open, onClose, companyId, ids = [], onExported }) {
  const [format, setFormat] = useState('webp')
  const [width, setWidth] = useState('2560')
  const [quality, setQuality] = useState('80')
  const [trashAfterExport, setTrashAfterExport] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const descId = useId()

  useEffect(() => {
    if (!open) return
    setFormat('webp')
    setWidth('2560')
    setQuality('80')
    setTrashAfterExport(readTrashAfterExportPref())
    setBusy(false)
    setError('')
  }, [open])

  function handleToggleTrashAfterExport(event) {
    const next = event.target.checked
    setTrashAfterExport(next)
    writeTrashAfterExportPref(next)
  }

  async function handleExport() {
    if (!companyId || !ids.length) return
    setBusy(true)
    setError('')
    try {
      await downloadLibraryExport(companyId, {
        ids,
        format,
        width: Number(width) || null,
        quality: Number(quality) || null,
      })
    } catch (err) {
      setError(err.message || 'No se pudo exportar')
      setBusy(false)
      return
    }

    // Export confirmado — a partir de acá nunca volvemos a mostrar un error
    // bloqueante: el archivo ya está en disco del usuario.
    let trashResult = null
    if (trashAfterExport) {
      try {
        trashResult = await trashAssets(companyId, ids)
      } catch (err) {
        trashResult = { trashed: 0, kept: [], trashError: err.message || 'No se pudo enviar a la papelera' }
      }
    }

    setBusy(false)
    onExported?.(trashResult)
    onClose?.()
  }

  const count = ids.length
  const formatIndex = Math.max(0, FORMAT_OPTIONS.findIndex((opt) => opt.value === format))

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Exportar ${count} imagen${count === 1 ? '' : 'es'}`}
      ariaDescribedBy={descId}
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
    >
      <p id={descId} className={styles.subtitle}>Elige el formato y el tamaño de exportación.</p>

      <div className={styles.field}>
        <span className={styles.fieldLabel}>Formato</span>
        <div
          className={styles.segmentedControl}
          style={{ '--seg-count': FORMAT_OPTIONS.length, '--seg-index': formatIndex }}
          role="tablist"
          aria-label="Formato de exportación"
        >
          <div className={styles.segmentedIndicator} aria-hidden="true" />
          {FORMAT_OPTIONS.map((opt) => {
            const active = format === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={active}
                className={cx(styles.segmentedOption, active && styles.segmentedOptionActive)}
                onClick={() => setFormat(opt.value)}
                disabled={busy}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className={styles.fieldGrid}>
        <Input
          label="Ancho máx. (px)"
          type="number"
          min="1"
          value={width}
          onChange={(event) => setWidth(event.target.value)}
          disabled={busy}
        />
        <Input
          label="Calidad"
          type="number"
          min="1"
          max="100"
          value={quality}
          onChange={(event) => setQuality(event.target.value)}
          disabled={busy}
        />
      </div>

      <label className={styles.toggleRow}>
        <input
          type="checkbox"
          className={styles.toggleCheckbox}
          checked={trashAfterExport}
          onChange={handleToggleTrashAfterExport}
          disabled={busy}
        />
        <span className={styles.toggleText}>
          <span className={styles.toggleLabel}>Enviar a papelera tras exportar</span>
          <span className={styles.toggleHint}>Recuperables por 30 días</span>
        </span>
      </label>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.actions}>
        <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
          Cancelar
        </Button>
        <Button type="button" variant="primary" loading={busy} disabled={busy || count === 0} onClick={handleExport}>
          Exportar
        </Button>
      </div>
    </Modal>
  )
}
