import { Modal, Button } from '../ui'
import { sanitizeContentHtml } from '../../lib/sanitizeHtml'
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
// SANITIZACIÓN (cerrada en la auditoría 2026-08): localHtml/remoteHtml vienen de
// mergeSections (lib/sectionMerge.js), que los toma del HTML serializado por el
// propio TipTap (local) o del `content_html` que devuelve el backend (remoto).
// Este era el 4º sink sin sanitizar; ahora pasa por `sanitizeContentHtml`
// (lib/sanitizeHtml.js, DOMPurify) igual que Preview/Handoff/SharePage y el panel
// de propuestas. El backend además sanea al escribir y en la salida pública
// (backend/src/lib/htmlSanitizer.js), así que esto es defensa en profundidad:
// cubre el contenido legacy ya almacenado sin depender de un backfill.
//
// Importa que siga acá: el HTML remoto lo escribe otro colaborador (incluido un
// `designer`, el rol de menor confianza con escritura) y se renderiza en la
// sesión autenticada de quien resuelve el conflicto.
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
            dangerouslySetInnerHTML={{ __html: sanitizeContentHtml(html) }}
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
    remoteEmptyText = isDocument
      ? `${actorName} eliminó el contenido del documento`
      : `${actorName} eliminó esta sección`
    footer = (
      <>
        <Button variant="ghost" onClick={() => resolve('keep-mine')}>Mantener la mía</Button>
        <Button variant="primary" onClick={() => resolve('accept-delete')}>Aceptar eliminación</Button>
      </>
    )
  } else if (type === 'deleted-local') {
    localEmptyText = isDocument
      ? 'Tú eliminaste el contenido del documento'
      : 'Tú eliminaste esta sección'
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
