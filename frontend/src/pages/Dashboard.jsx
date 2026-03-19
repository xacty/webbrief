import { useNavigate } from 'react-router-dom'

// Mock data — 4 proyectos de ejemplo
const MOCK_PROJECTS = [
  {
    id: 1,
    name: 'Rediseño corporativo',
    client: 'Estudio Nómade',
    lastActivity: '2026-03-15',
    hasChanges: true,
  },
  {
    id: 2,
    name: 'Landing de producto',
    client: 'Arkea Foods',
    lastActivity: '2026-03-10',
    hasChanges: false,
  },
  {
    id: 3,
    name: 'Portal de clientes',
    client: 'Finova Group',
    lastActivity: '2026-03-08',
    hasChanges: true,
  },
  {
    id: 4,
    name: 'Sitio institucional',
    client: 'Fundación Raíces',
    lastActivity: '2026-02-28',
    hasChanges: false,
  },
]

// Formatea "2026-03-15" → "15 mar 2026"
function formatDate(isoDate) {
  return new Date(isoDate).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function Dashboard() {
  const navigate = useNavigate()

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div style={styles.page}>
      {/* Encabezado */}
      <div style={styles.header}>
        <h1 style={styles.title}>WebBrief</h1>
        <div style={styles.headerActions}>
          <button style={styles.btnPrimary} onClick={() => navigate('/new-project')}>+ Nuevo proyecto</button>
          <button style={styles.btnGhost} onClick={logout}>Cerrar sesión</button>
        </div>
      </div>

      {/* Grilla de proyectos */}
      <div style={styles.grid}>
        {MOCK_PROJECTS.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  )
}

function ProjectCard({ project }) {
  const navigate = useNavigate()

  return (
    <div style={styles.card}>
      {/* Nombre del proyecto y badge de cambios */}
      <div style={styles.cardHeader}>
        <span style={styles.projectName}>{project.name}</span>
        {project.hasChanges && (
          <span style={styles.badge}>● Cambios</span>
        )}
      </div>

      {/* Cliente */}
      <p style={styles.clientName}>{project.client}</p>

      {/* Última actividad */}
      <p style={styles.lastActivity}>
        Última actividad: {formatDate(project.lastActivity)}
      </p>

      {/* Botón abrir */}
      <button
        style={styles.btnSecondary}
        onClick={() => navigate(`/project/${project.id}/editor`)}
      >
        Abrir proyecto
      </button>
    </div>
  )
}

// Estilos centralizados para mantener el código del JSX limpio
const styles = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '32px 24px',
    fontFamily: 'system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
  },
  headerActions: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: 20,
  },
  card: {
    border: '1px solid #e2e8f0',
    borderRadius: 10,
    padding: 20,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    backgroundColor: '#fff',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  projectName: {
    fontWeight: 600,
    fontSize: 16,
    lineHeight: 1.3,
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: '#f59e0b',
    whiteSpace: 'nowrap',
    marginTop: 2,
  },
  clientName: {
    margin: 0,
    fontSize: 14,
    color: '#64748b',
  },
  lastActivity: {
    margin: 0,
    fontSize: 13,
    color: '#94a3b8',
    flexGrow: 1,
  },
  btnPrimary: {
    padding: '8px 16px',
    backgroundColor: '#0f172a',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnGhost: {
    padding: '8px 16px',
    backgroundColor: 'transparent',
    color: '#64748b',
    border: '1px solid #e2e8f0',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
  },
  btnSecondary: {
    marginTop: 4,
    padding: '7px 14px',
    backgroundColor: 'transparent',
    color: '#0f172a',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    alignSelf: 'flex-start',
  },
}
