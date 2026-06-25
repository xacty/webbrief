import { useEffect, useMemo, useState } from 'react'
import { Button, Modal, Select } from './ui'
import { apiFetch } from '../lib/api'
import styles from './MoveToCompanyModal.module.css'

/**
 * MoveToCompanyModal — bulk move N projects to another company.
 *
 * Loads /api/companies on open and filters to companies where the current user
 * has manager / admin role (so we never offer a destination the backend will
 * reject). Excludes the current company. On submit, POSTs to
 * /api/projects/bulk/move-company and reports success / partial failure.
 *
 * Props:
 *   open: boolean
 *   ids: string[]                project ids to move
 *   currentCompanyId: string     filtered out of the destination list
 *   isAdmin: boolean             admin sees every company (read membership-less)
 *   onClose(): void
 *   onSuccess({ moved, failed, targetCompany }): void
 */
export default function MoveToCompanyModal({
  open,
  ids = [],
  currentCompanyId,
  isAdmin = false,
  onClose,
  onSuccess,
}) {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [targetCompanyId, setTargetCompanyId] = useState('')

  const eligibleCompanies = useMemo(() => {
    return (companies || []).filter((company) => {
      if (!company || !company.id) return false
      if (company.id === currentCompanyId) return false
      if (isAdmin) return true
      return company.membershipRole === 'admin' || company.membershipRole === 'manager'
    })
  }, [companies, currentCompanyId, isAdmin])

  useEffect(() => {
    if (!open) return undefined
    setError('')
    setTargetCompanyId('')
    let active = true
    setLoading(true)
    apiFetch('/api/companies')
      .then((data) => {
        if (!active) return
        setCompanies(Array.isArray(data?.companies) ? data.companies : [])
      })
      .catch((err) => {
        if (!active) return
        setError(err?.message || 'No se pudieron cargar las empresas')
      })
      .finally(() => {
        if (!active) return
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open])

  async function handleSubmit(event) {
    event.preventDefault()
    if (!targetCompanyId) return
    if (!Array.isArray(ids) || ids.length === 0) return
    setSubmitting(true)
    setError('')
    try {
      const result = await apiFetch('/api/projects/bulk/move-company', {
        method: 'POST',
        body: JSON.stringify({ ids, target_company_id: targetCompanyId }),
      })
      const targetCompany = eligibleCompanies.find((c) => c.id === targetCompanyId) || null
      if (typeof onSuccess === 'function') {
        onSuccess({
          moved: Number(result?.moved || 0),
          failed: Array.isArray(result?.failed) ? result.failed : [],
          targetCompany,
        })
      }
      onClose?.()
    } catch (err) {
      setError(err?.message || 'No se pudieron mover los proyectos')
    } finally {
      setSubmitting(false)
    }
  }

  const count = Array.isArray(ids) ? ids.length : 0
  const disabled = !targetCompanyId || submitting || loading || eligibleCompanies.length === 0

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mover de empresa"
      size="md"
      ariaDescribedBy="move-modal-description"
      footer={
        <div className={styles.footer}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSubmit}
            disabled={disabled}
            loading={submitting}
          >
            {submitting ? 'Moviendo...' : 'Mover'}
          </Button>
        </div>
      }
    >
      <p id="move-modal-description" className={styles.description}>
        Mover {count} proyecto{count === 1 ? '' : 's'} a:
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        <Select
          label="Empresa destino"
          value={targetCompanyId}
          onChange={(event) => setTargetCompanyId(event.target.value)}
          disabled={loading || submitting}
          placeholder={loading ? 'Cargando empresas...' : 'Selecciona una empresa'}
          required
        >
          {eligibleCompanies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>

        {!loading && eligibleCompanies.length === 0 && (
          <p className={styles.emptyHint}>
            No hay empresas elegibles. Solo puedes mover proyectos a empresas donde seas manager.
          </p>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </form>
    </Modal>
  )
}
