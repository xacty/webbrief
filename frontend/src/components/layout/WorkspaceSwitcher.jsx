import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, ChevronDown, List, Plus, Search } from 'lucide-react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { companyToSlug } from '../../lib/companySlug'
import styles from './WorkspaceSwitcher.module.css'

const SEARCH_THRESHOLD = 5

function initials(name) {
  if (!name) return '?'
  const trimmed = name.trim()
  const parts = trimmed.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function WorkspaceSwitcher({
  canCreateCompany = false,
  canViewAllCompanies = false,
  onCreateCompany,
  onViewAllCompanies,
}) {
  const { currentCompany, accessibleCompanies, switchCompany, loading } = useWorkspace()
  const location = useLocation()
  const navigate = useNavigate()

  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState(null)
  const [query, setQuery] = useState('')
  const triggerRef = useRef(null)
  const dropdownRef = useRef(null)
  const searchRef = useRef(null)

  const computePosition = useCallback(() => {
    const node = triggerRef.current
    if (!node) return null
    const rect = node.getBoundingClientRect()
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0
    const gap = 4
    return {
      top: Math.min(rect.bottom + gap, vh - 8),
      left: rect.left,
      width: rect.width,
    }
  }, [])

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return undefined
    }
    function update() {
      const next = computePosition()
      if (next) setPosition(next)
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, computePosition])

  useEffect(() => {
    if (!open) return undefined
    function onDocMouseDown(e) {
      if (triggerRef.current && triggerRef.current.contains(e.target)) return
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return
      setOpen(false)
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus?.()
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (open && accessibleCompanies.length >= SEARCH_THRESHOLD) {
      searchRef.current?.focus?.()
    }
    if (!open) setQuery('')
  }, [open, accessibleCompanies.length])

  const filteredCompanies = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accessibleCompanies
    return accessibleCompanies.filter((c) =>
      [c.name, c.slug].filter(Boolean).some((v) => v.toLowerCase().includes(q)),
    )
  }, [accessibleCompanies, query])

  function handleSelect(slug) {
    switchCompany(slug)
    setOpen(false)
    triggerRef.current?.focus?.()
    // Always land on the new company's Projects page — the main view
    // of the workspace. Switching empresa from anywhere (admin pages,
    // settings, even another company's Team/Activity) should feel
    // like opening that empresa from scratch, not silently rebinding
    // context to the current section.
    navigate(`/c/${slug}/projects`)
  }

  function handleCreate() {
    setOpen(false)
    if (onCreateCompany) onCreateCompany()
  }

  function handleViewAll() {
    setOpen(false)
    if (onViewAllCompanies) onViewAllCompanies()
  }

  if (loading && !currentCompany) {
    return (
      <div className={styles.root}>
        <div className={styles.trigger} aria-busy="true">
          <span className={`${styles.avatar} ${styles.avatarInternal}`} aria-hidden="true">…</span>
          <span className={styles.triggerName}>Cargando…</span>
        </div>
      </div>
    )
  }

  if (!currentCompany) {
    return null
  }

  const activeSlug = companyToSlug(currentCompany)
  const showSearch = accessibleCompanies.length >= SEARCH_THRESHOLD

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        aria-haspopup="listbox"
        aria-expanded={open ? 'true' : 'false'}
        aria-label={`Empresa activa: ${currentCompany.name}. Cambiar de empresa.`}
        data-tour="workspace-switcher"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={`${styles.avatar} ${currentCompany.isInternal ? styles.avatarInternal : ''}`}
          aria-hidden="true"
        >
          {initials(currentCompany.name)}
        </span>
        <span className={styles.triggerName}>{currentCompany.name}</span>
        <ChevronDown size={14} className={styles.triggerCaret} aria-hidden="true" />
      </button>

      {open &&
        position &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            className={styles.dropdown}
            role="listbox"
            aria-label="Seleccionar empresa"
            style={{ top: position.top, left: position.left, width: position.width }}
          >
            {showSearch && (
              <div className={styles.searchWrap}>
                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      left: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--wb-color-neutral-500)',
                    }}
                  />
                  <input
                    ref={searchRef}
                    type="search"
                    placeholder="Buscar empresa"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={styles.searchInput}
                    style={{ paddingLeft: 26 }}
                    aria-label="Buscar empresa"
                  />
                </div>
              </div>
            )}

            <div className={styles.list}>
              {filteredCompanies.length === 0 && (
                <p className={styles.empty}>Sin resultados</p>
              )}
              {filteredCompanies.map((company) => {
                const slug = companyToSlug(company)
                const isActive = slug === activeSlug
                return (
                  <button
                    key={company.id}
                    type="button"
                    role="option"
                    aria-selected={isActive ? 'true' : 'false'}
                    className={`${styles.item} ${isActive ? styles.itemActive : ''}`}
                    onClick={() => handleSelect(slug)}
                  >
                    <span
                      className={`${styles.avatar} ${company.isInternal ? styles.avatarInternal : ''}`}
                      aria-hidden="true"
                    >
                      {initials(company.name)}
                    </span>
                    <span className={styles.itemName}>{company.name}</span>
                    {company.isInternal && <span className={styles.itemBadge}>interna</span>}
                    {isActive && (
                      <Check size={14} className={styles.itemCheck} aria-hidden="true" />
                    )}
                  </button>
                )
              })}
            </div>

            {((canCreateCompany && onCreateCompany) || (canViewAllCompanies && onViewAllCompanies)) && (
              <div className={styles.separator} />
            )}

            {canCreateCompany && onCreateCompany && (
              <button type="button" className={styles.item} onClick={handleCreate}>
                <Plus size={16} aria-hidden="true" style={{ marginLeft: 4 }} />
                <span className={styles.itemName}>Crear empresa</span>
              </button>
            )}

            {canViewAllCompanies && (
              <button type="button" className={styles.item} onClick={handleViewAll}>
                <List size={16} aria-hidden="true" style={{ marginLeft: 4 }} />
                <span className={styles.itemName}>
                  Ver todas ({accessibleCompanies.length})
                </span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
