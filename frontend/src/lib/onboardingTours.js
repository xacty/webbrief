/**
 * Onboarding tour definitions consumed by TourContext.
 *
 * Each builder returns a tour spec:
 *   { id, steps, onComplete?, onSkip? }
 *
 * The OnboardingChecklist task click handler picks the right builder
 * for the task being launched and calls `start(tourSpec)`. Builders
 * receive a `ctx` with workspace + auth state so steps can branch:
 *
 *   ctx = {
 *     currentCompanySlug,
 *     hasProjects,
 *     role,                 // 'admin' | 'manager' | 'editor' | 'content_writer' | 'designer' | 'developer'
 *     isPlatformAdmin,
 *     projectType,          // when launched from inside the editor
 *   }
 *
 * Step.target uses CSS selectors for `data-tour="..."` attributes
 * planted in the existing UI (F3a). Spotlight resolves them at render.
 */

import { markTaskDone } from './tutorialState'

const Q = (key) => `[data-tour="${key}"]`

// ─── Conoce tu workspace ────────────────────────────────────────────
// Informational only — guides the user through the shell.
export function buildWorkspaceTour(ctx = {}) {
  const { isPlatformAdmin = false } = ctx
  return {
    id: 'discover_workspace',
    onComplete: () => markTaskDone('discover_workspace'),
    onSkip: () => markTaskDone('discover_workspace'),
    steps: [
      {
        target: Q('workspace-switcher'),
        title: 'Tu empresa activa',
        body:
          'Aquí ves la empresa en la que estás trabajando. Si pertenecieras a varias, podrías cambiar entre ellas desde este menú.',
        placement: 'right',
      },
      {
        target: Q('sidebar-projects'),
        title: 'Proyectos',
        body:
          'El listado de proyectos de la empresa activa. Cada proyecto es un brief, un artículo, una página web o una serie de FAQs.',
        placement: 'right',
      },
      {
        target: Q('sidebar-team'),
        title: 'Equipo',
        body:
          'Quién tiene acceso a esta empresa y con qué rol. Desde aquí invitas a tus compañeros.',
        placement: 'right',
      },
      {
        target: Q('sidebar-activity'),
        title: 'Actividad',
        body:
          'Bitácora de cambios en los proyectos de esta empresa: ediciones, links públicos, comentarios.',
        placement: 'right',
      },
      ...(isPlatformAdmin
        ? [
            {
              target: '#global-role-preview-select',
              title: 'Vista por rol',
              body:
                'Como admin de plataforma, puedes simular cómo ven la app los distintos roles. Útil para verificar permisos sin cambiar de cuenta.',
              placement: 'top',
            },
          ]
        : []),
    ],
  }
}

// ─── Crea tu primer proyecto ────────────────────────────────────────
// Branches on hasProjects: if there is at least one, just show an
// informational pointer at the +Proyecto button. If empty, walk the
// user through the form fields.
export function buildCreateProjectTour(ctx = {}) {
  const { hasProjects = false, currentCompanySlug = null } = ctx

  if (hasProjects) {
    return {
      id: 'create_project_info',
      onComplete: () => markTaskDone('create_project'),
      onSkip: () => markTaskDone('create_project'),
      steps: [
        {
          target: Q('create-project-btn'),
          title: 'Crear un proyecto',
          body:
            'Cada vez que quieras un brief, artículo, página o FAQ, lo creas desde aquí. Elige tipo, dale nombre y opcionalmente parte de una plantilla.',
          placement: 'bottom',
          route: currentCompanySlug ? `/c/${currentCompanySlug}/projects` : undefined,
        },
      ],
    }
  }

  return {
    id: 'create_project_guided',
    onComplete: () => markTaskDone('create_project'),
    onSkip: () => markTaskDone('create_project'),
    steps: [
      {
        target: Q('create-project-btn'),
        title: 'Crea tu primer proyecto',
        body:
          'Pulsa este botón para abrir el formulario. Vamos a llenarlo juntos en los próximos pasos.',
        placement: 'bottom',
        route: currentCompanySlug ? `/c/${currentCompanySlug}/projects` : undefined,
        nextLabel: 'Abrir formulario',
        onAdvance: ({ navigate }) => {
          navigate(
            currentCompanySlug ? `/new-project?company=${currentCompanySlug}` : '/new-project',
          )
        },
      },
      {
        target: Q('newproject-name'),
        title: 'Nombre del proyecto',
        body:
          'Algo descriptivo para identificarlo después: "Landing campaña Q3", "Artículo blog mayo", etc.',
        placement: 'right',
        route: '/new-project',
      },
      {
        target: Q('newproject-type'),
        title: 'Tipo de proyecto',
        body:
          'Página Web (brief seccionado), Brief (cuestionario), Artículo (editor lineal) o FAQ (preguntas y respuestas). Cada tipo genera una estructura distinta.',
        placement: 'right',
      },
      {
        target: Q('newproject-plantilla'),
        title: 'Plantilla (opcional)',
        body:
          'Si quieres partir de una estructura sugerida —clínica, e-commerce, restaurante, etc.— elígela aquí. Si no, deja "Tabula rasa" y arma la estructura desde cero.',
        placement: 'right',
      },
      {
        target: Q('newproject-submit'),
        title: 'Crea el proyecto',
        body:
          'Cuando esté listo, pulsa "Crear proyecto" y te llevamos directo al editor para empezar a llenarlo.',
        placement: 'top',
        skipLabel: 'Cerrar tour',
      },
    ],
  }
}

// ─── Edita una página ───────────────────────────────────────────────
// Project-editor walkthrough. Heavily branched by projectType + role.
// Currently focused on `page` (Página Web). Other types degrade
// gracefully to a one-step info bubble.
export function buildEditPageTour(ctx = {}) {
  const { projectType = 'page', role = null } = ctx

  // Public viewers get no editor tour at all.
  if (role === 'public_viewer') {
    return {
      id: 'edit_page_skipped',
      onComplete: () => markTaskDone('edit_page'),
      steps: [],
    }
  }

  if (projectType !== 'page') {
    // Brief/Artículo/FAQ — single info bubble pointing at sections panel.
    return {
      id: 'edit_page_other',
      onComplete: () => markTaskDone('edit_page'),
      onSkip: () => markTaskDone('edit_page'),
      steps: [
        {
          target: Q('editor-sections'),
          title: 'Edita el contenido',
          body:
            'Cada bloque del panel izquierdo es una sección. Doble click en el título para renombrarla; arrastra para reordenar.',
          placement: 'right',
        },
      ],
    }
  }

  // Página Web — full editor walkthrough.
  const skipFloatingBar = role === 'content_writer'

  return {
    id: 'edit_page_web',
    onComplete: () => markTaskDone('edit_page'),
    onSkip: () => markTaskDone('edit_page'),
    steps: [
      {
        target: Q('editor-pages'),
        title: 'Páginas',
        body:
          'Una página web puede tener varias páginas (Inicio, Servicios, Contacto…). Cambia entre ellas con estas pills. El botón + agrega una nueva.',
        placement: 'bottom',
      },
      {
        target: Q('editor-sections'),
        title: 'Secciones',
        body:
          'Cada página se divide en secciones. Aquí ves la estructura y puedes agregar, reordenar o renombrar bloques.',
        placement: 'right',
      },
      {
        target: Q('editor-toolbar'),
        title: 'Edición de contenido',
        body:
          'La barra superior controla el formato: títulos, listas, negrita, links, tablas, imágenes. Selecciona texto para aplicarlo.',
        placement: 'bottom',
      },
      ...(skipFloatingBar
        ? []
        : [
            {
              target: Q('editor-floating-bar'),
              title: 'Modos del editor',
              body:
                'Brief: edición interna. Handoff: vista para Dev y Designer con bloques etiquetados. Preview: vista que verá el cliente. Cambia con Cmd+1/2/3.',
              placement: 'top',
            },
          ]),
    ],
  }
}

// ─── Modales info: share link + comentario ──────────────────────────
// One-step tours that read more like a modal. We still use Spotlight
// for visual consistency, with target=null so it centers on the
// viewport.

export function buildShareLinkInfo() {
  return {
    id: 'share_link_info',
    onComplete: () => markTaskDone('create_share_link'),
    onSkip: () => markTaskDone('create_share_link'),
    steps: [
      {
        target: null,
        title: 'Comparte un link público',
        body:
          'Desde el panel derecho del editor (Actividad → "Crear link privado"), generas un link que puedes enviar al cliente para que vea o comente el proyecto sin necesidad de cuenta. Cada link tiene su propio control de permisos.',
        placement: 'bottom',
        nextLabel: 'Entendido',
      },
    ],
  }
}

export function buildLeaveCommentInfo() {
  return {
    id: 'leave_comment_info',
    onComplete: () => markTaskDone('leave_comment'),
    onSkip: () => markTaskDone('leave_comment'),
    steps: [
      {
        target: null,
        title: 'Deja un comentario',
        body:
          'Selecciona texto dentro del editor y click derecho para dejar un comentario anclado. Aparece en el hilo del panel derecho. Igual funciona para clientes que entran por link público.',
        placement: 'bottom',
        nextLabel: 'Entendido',
      },
    ],
  }
}
