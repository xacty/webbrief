import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileQuestionMark } from 'lucide-react'
import EmptyState from '../components/onboarding/EmptyState'
import { useWorkspace } from '../contexts/WorkspaceContext'
import { companyToSlug } from '../lib/companySlug'
import styles from './NotFoundPage.module.css'

export default function NotFoundPage() {
  const navigate = useNavigate()
  const { currentCompany } = useWorkspace()

  const goHome = useCallback(() => {
    if (currentCompany) {
      navigate(`/c/${companyToSlug(currentCompany)}/projects`)
    } else {
      navigate('/companies')
    }
  }, [navigate, currentCompany])

  return (
    <div className={styles.wrap}>
      <EmptyState
        icon={FileQuestionMark}
        title="No encontrado"
        body="La página que buscas no existe o no tienes acceso a ella."
        cta={{ label: 'Volver al inicio', onClick: goHome }}
      />
    </div>
  )
}
