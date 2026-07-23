import { Modal, Button } from '../ui'
import styles from './ConflictCompareModal.module.css'

// ---------------------------------------------------------------------------
// ConflictCompareModal — F4 (colaboración, docs/superpowers/specs/2026-07-22-
// editor-collab-navbar-design.md). Comparador de solo lectura para un
// conflicto de sección acumulado por syncRemoteChanges (ver ProjectEditor.jsx
// §F3/§F4): dos columnas "Tu versión" / "Versión de {actorName}" y acciones
// de resolución que varían por `conflict.type` ('edit' | 'deleted-remote' |
// 'deleted-local'). La mutación real del documento vive en
// ProjectEditor.resolveConflict — este componente solo renderiza y delega
// la acción elegida via onResolve.
//
// SANITIZACIÓN: localHtml/remoteHtml vienen de mergeSections (lib/sectionMerge.js),
// que a su vez los toma del HTML serializado por el propio editor TipTap (local)
// o del `content_html` que el backend devuelve para la página (remoto) — el
// mismo contenido de autor autenticado que Preview/Handoff/SharePage ya
// renderizan sin sanitizar vía dangerouslySetInnerHTML en ESTA rama (ver
// ProjectEditor.jsx PreviewPanel y SharePage.jsx). No hay input de terceros
// ni de usuarios anónimos en esta ruta. `dompurify` no está en
// frontend/package.json en `feat/editor-collab-navbar` y no se agregó como
// dependencia nueva solo para este modal.
//
// OJO — esto NO es un caso "sin precedente conocido": existe un fix ya
// escrito para exactamente este problema en la rama local (no mergeada)
// `fix/security-s1-xss-sanitization` (`frontend/src/lib/sanitizeHtml.js`,
// DOMPurify, cablea los 3 sinks de Preview/Handoff/SharePage — ver memoria
// `project_security_audit_2026_06`). Este componente agrega un 4º sink del
// mismo tipo y NO está cubierto por ese fix. Reportado como concern en el
// informe de la tarea — cuando esa rama se mergee, cablear
// `sanitizeHtml(localHtml)`/`sanitizeHtml(remoteHtml)` acá también.
// ---------------------------------------------------------------------------

function ConflictColumn({ label, badgeClassName, html, emptyText }) {
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader}>
        <span className={badgeClassName}>{label}</span>
      </div>
      <div className={styles.columnBody}>
        {emptyText ? (
          <p className={styles.emptyState}>{emptyText}</p>
        ) : (
          <div
            className={styles.columnContent}
            // eslint-disable-next-line react/no-danger -- ver nota de sanitización arriba
            dangerouslySetInnerHTML={{ __html: html || '' }}
          />
        )}
      </div>
    </div>
  )
}

export default function ConflictCompareModal({ open, conflict, onClose, onResolve }) {
  const sectionName = conflict?.sectionName || 'Sección'
  const actorName = conflict?.actorName || 'la otra sesión'
  const type = conflict?.type
  // Proyectos document no tienen sectionDivider — '__document__' es el
  // documento entero, no hay "debajo de la sección" donde insertar una
  // segunda versión, así que ese botón no aplica acá.
  const isDocument = conflict?.sectionId === '__document__'

  function resolve(action) {
    onResolve?.(conflict, action)
  }

  let footer = null
  let localEmptyText = null
  let remoteEmptyText = null

  if (type === 'edit') {
    footer = (
      <>
        <Button variant="ghost" onClick={() => resolve('keep-mine')}>Mantener la mía</Button>
        <Button variant={isDocument ? 'primary' : 'secondary'} onClick={() => resolve('use-theirs')}>Usar la suya</Button>
        {!isDocument && (
          <Button variant="primary" onClick={() => resolve('insert-below')}>Insertar la suya debajo</Button>
        )}
      </>
    )
  } else if (type === 'deleted-remote') {
    remoteEmptyText = `${actorName} eliminó esta sección`
    footer = (
      <>
        <Button variant="ghost" onClick={() => resolve('keep-mine')}>Mantener la mía</Button>
        <Button variant="primary" onClick={() => resolve('accept-delete')}>Aceptar eliminación</Button>
      </>
    )
  } else if (type === 'deleted-local') {
    localEmptyText = 'Tú eliminaste esta sección'
    footer = (
      <>
        <Button variant="ghost" onClick={() => resolve('keep-deleted')}>Mantener eliminada</Button>
        <Button variant="primary" onClick={() => resolve('restore-theirs')}>Restaurar la suya</Button>
      </>
    )
  }

  return (
    <Modal
      open={open && !!conflict}
      onClose={onClose}
      title={isDocument ? 'Conflicto en este documento' : `Conflicto en «${sectionName}»`}
      size="lg"
      footer={footer}
    >
      <div className={styles.grid}>
        <ConflictColumn
          label="Tu versión"
          badgeClassName={styles.badgeLocal}
          html={conflict?.localHtml}
          emptyText={localEmptyText}
        />
        <ConflictColumn
          label={`Versión de ${actorName}`}
          badgeClassName={styles.badgeRemote}
          html={conflict?.remoteHtml}
          emptyText={remoteEmptyText}
        />
      </div>
    </Modal>
  )
}
