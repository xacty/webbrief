import React, { useEffect, useState } from 'react';
import {
  Globe,
  FileText,
  CircleQuestionMark,
  ClipboardList,
  X,
  Layers,
  Type,
  Eye,
  MessageSquare,
  Ruler,
  Search,
  FileQuestionMark,
  FileDown,
  Plus,
  UserCheck,
  Upload,
  Link2,
} from 'lucide-react';
import { Button } from '../ui';
import { getTutorialState, markTypeSeen, isOnboardingActive } from '../../lib/tutorialState';
import { useTour } from './TourContext';
import styles from './ProjectTypeExplainer.module.css';

const TYPE_CONTENT = {
  page: {
    title: 'Cómo funciona Página Web',
    Icon: Globe,
    bullets: [
      { Icon: Layers, text: 'Multi-página: cambia con las pills del navbar superior. Cada página se divide en secciones que ves en el panel izquierdo.' },
      { Icon: Type, text: 'Doble click en el título de una sección para renombrarla.' },
      { Icon: Eye, text: '3 modos: Brief (edición), Handoff (entregable para Dev/Designer) y Preview (cómo lo ve el cliente).' },
      { Icon: MessageSquare, text: 'Comentarios anclados a texto: selecciona y haz click derecho para crear uno.' },
    ],
  },
  document: {
    title: 'Cómo funciona Artículo',
    Icon: FileText,
    bullets: [
      { Icon: Layers, text: 'Editor lineal: sin secciones, la jerarquía se forma con H1/H2/H3.' },
      { Icon: Ruler, text: 'Reglas de contenido (panel inferior derecho): título, meta, slug y máx. palabras.' },
      { Icon: Search, text: 'SEO metadata en el navbar (icono lápiz) — aparece al final del handoff Dev.' },
      { Icon: MessageSquare, text: 'Comentarios anclados igual que en Página Web.' },
    ],
  },
  faq: {
    title: 'Cómo funciona FAQs',
    Icon: CircleQuestionMark,
    bullets: [
      { Icon: FileQuestionMark, text: 'Cada pregunta es una sección. El primer H2 o H3 del bloque es la pregunta.' },
      { Icon: Plus, text: 'Botón "+" del navbar abre un modal con textarea para crear preguntas largas.' },
      { Icon: FileDown, text: 'Exporta a CSV desde el menú de la página.' },
      { Icon: Layers, text: 'El panel de secciones lista preguntas con el rótulo "Pregunta Frecuente N".' },
    ],
  },
  brief: {
    title: 'Cómo funciona Brief',
    Icon: ClipboardList,
    bullets: [
      { Icon: Link2, text: 'Este editor es para el cliente — link público /b/:token sin login.' },
      { Icon: FileQuestionMark, text: 'Define preguntas tipo: encabezado, texto corto/largo, opción única/múltiple, archivo.' },
      { Icon: Upload, text: 'Presupuesto de 500 MB por proyecto para los uploads del cliente (PDF, imágenes, Office).' },
      { Icon: UserCheck, text: 'El cliente ve un formulario simple, no este editor.' },
    ],
  },
};

export default function ProjectTypeExplainer({ projectType }) {
  const [open, setOpen] = useState(false);
  const { isActive: tourIsActive } = useTour();

  useEffect(() => {
    if (!projectType || !TYPE_CONTENT[projectType]) return undefined;
    const state = getTutorialState();
    if (!isOnboardingActive(state)) return undefined;
    if (state.typeExplainers[projectType]) return undefined;
    // Don't compete with the guided tour Spotlight — defer until the
    // tour exits. The next time the user lands on this editor the
    // effect re-runs (mount/projectType change) and opens normally.
    if (tourIsActive) return undefined;
    const id = window.requestAnimationFrame(() => setOpen(true));
    return () => window.cancelAnimationFrame(id);
  }, [projectType, tourIsActive]);

  // If the tour activates while the explainer is already open, hide
  // the explainer immediately (it'll come back when the tour exits
  // and the user revisits this editor / type).
  useEffect(() => {
    if (tourIsActive && open) setOpen(false);
  }, [tourIsActive, open]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function handleClose() {
    markTypeSeen(projectType);
    setOpen(false);
  }

  if (!open) return null;
  const content = TYPE_CONTENT[projectType];
  if (!content) return null;
  const HeaderIcon = content.Icon;

  return (
    <aside className={styles.wrap} role="complementary" aria-label={content.title}>
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <span className={styles.headerIcon} aria-hidden="true">
            <HeaderIcon size={18} />
          </span>
          <h2 className={styles.headerTitle}>{content.title}</h2>
        </div>
        <button
          type="button"
          className={styles.close}
          onClick={handleClose}
          aria-label="Cerrar explicación"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className={styles.body}>
        {content.bullets.map((b, i) => {
          const BulletIcon = b.Icon;
          return (
            <div key={i} className={styles.bullet}>
              <span className={styles.bulletIcon} aria-hidden="true">
                <BulletIcon size={16} />
              </span>
              <p className={styles.bulletText}>{b.text}</p>
            </div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <Button variant="primary" onClick={handleClose}>
          Entendido
        </Button>
      </div>
    </aside>
  );
}
