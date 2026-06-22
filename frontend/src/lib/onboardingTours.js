/**
 * Onboarding tour definitions consumed by TourContext.
 *
 * Each builder returns a tour spec:
 *   { id, steps, onComplete?, onSkip? }
 *
 * The TourContext chain dispatcher picks the right builder for each
 * task in the queue and resolves a context `ctx`:
 *
 *   ctx = {
 *     isPlatformAdmin,
 *     role,
 *     currentCompanySlug,
 *     hasProjects,
 *     projects,
 *     lastProject,
 *     projectId,        // present when launching the edit_page / share / comment tours
 *     projectType,      // ditto
 *   }
 *
 * Step.target uses CSS selectors for `data-tour="..."` attributes
 * planted in the existing UI.
 */

import { markTaskDone } from './tutorialState'

const Q = (key) => `[data-tour="${key}"]`

// ─── Conoce tu workspace ────────────────────────────────────────────
// Informational only — guides through the shell.
export function buildWorkspaceTour(ctx = {}) {
  const { canSeeTrash = false } = ctx
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
      ...(canSeeTrash
        ? [
            {
              target: Q('sidebar-archivados'),
              title: 'Archivados',
              body:
                'Si archivas un proyecto, lo dejas fuera del listado activo pero conservado intacto. Quedan aquí indefinidamente hasta que decidas restaurarlos o eliminarlos.',
              placement: 'right',
            },
            {
              target: Q('sidebar-papelera'),
              title: 'Papelera',
              body:
                'Los proyectos enviados a la papelera se conservan 30 días y luego se eliminan automáticamente. Puedes restaurarlos antes de que venza ese plazo.',
              placement: 'right',
            },
          ]
        : []),
    ],
  }
}

// ─── Invita a un miembro del equipo ─────────────────────────────────
// Multi-step guided: sidebar → button → modal → user cancels.
export function buildInviteMemberTour(ctx = {}) {
  const { currentCompanySlug = null } = ctx
  const teamRoute = currentCompanySlug ? `/c/${currentCompanySlug}/team` : null
  return {
    id: 'invite_member',
    onComplete: () => markTaskDone('invite_member'),
    onSkip: () => markTaskDone('invite_member'),
    steps: [
      {
        target: Q('sidebar-team'),
        title: 'Sección Equipo',
        body:
          'Aquí gestionas quién tiene acceso a esta empresa. Pulsa Siguiente para ir a la sección.',
        placement: 'right',
        onAdvance: ({ navigate }) => {
          if (teamRoute) navigate(teamRoute)
        },
      },
      {
        target: Q('invite-member-btn'),
        title: 'Invitar miembro',
        body:
          'Este botón abre el formulario de invitación. Pulsa Siguiente para abrirlo.',
        placement: 'bottom',
        route: teamRoute || undefined,
        onAdvance: ({ navigate }) => {
          if (teamRoute) navigate(`${teamRoute}?invite=1`)
        },
      },
      {
        target: Q('invite-modal'),
        title: 'Formulario de invitación',
        body:
          'Email del invitado, su rol y nombre opcional. Como esto es un tutorial, NO envíes la invitación: pulsa Listo cuando termines de explorar.',
        placement: 'right',
      },
    ],
  }
}

// ─── Crea tu primer proyecto ────────────────────────────────────────
// Always-guided: 5 steps regardless of whether projects already exist.
// The user learns the form even if they have existing projects.
export function buildCreateProjectTour(ctx = {}) {
  const { currentCompanySlug = null } = ctx
  const projectsRoute = currentCompanySlug ? `/c/${currentCompanySlug}/projects` : null
  const newProjectRoute = currentCompanySlug
    ? `/new-project?company=${currentCompanySlug}`
    : '/new-project'
  return {
    id: 'create_project',
    onComplete: () => markTaskDone('create_project'),
    onSkip: () => markTaskDone('create_project'),
    steps: [
      {
        target: Q('sidebar-projects'),
        title: 'Ir a Proyectos',
        body:
          'Empezamos en la sección Proyectos. Pulsa Siguiente para abrirla.',
        placement: 'right',
        onAdvance: ({ navigate }) => {
          if (projectsRoute) navigate(projectsRoute)
        },
      },
      {
        target: Q('create-project-btn'),
        title: 'Crear un proyecto',
        body:
          'Cada vez que quieras un brief, artículo, página o FAQs, lo creas desde aquí. Pulsa Siguiente para abrir el formulario.',
        placement: 'bottom',
        route: projectsRoute || undefined,
        onAdvance: ({ navigate }) => {
          navigate(newProjectRoute)
        },
      },
      {
        target: Q('newproject-name'),
        title: 'Nombre del proyecto',
        body:
          'Algo descriptivo para identificarlo después: "Landing campaña Q3", "Artículo blog mayo", etc.',
        placement: 'right',
        route: newProjectRoute,
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
          'Cuando esté listo, pulsa "Crear proyecto" y te llevamos directo al editor. El tutorial continúa allí con el siguiente paso.',
        placement: 'top',
      },
    ],
  }
}

// ─── Edita una página ───────────────────────────────────────────────
// Editor walkthrough. Branches on projectType + role.
// public_viewer never reaches this (gated at AppShell level).
export function buildEditPageTour(ctx = {}) {
  const { projectType = 'page', role = null, projectId = null } = ctx
  const editorRoute = projectId ? `/project/${projectId}/editor` : null

  if (projectType !== 'page') {
    return {
      id: 'edit_page',
      onComplete: () => markTaskDone('edit_page'),
      onSkip: () => markTaskDone('edit_page'),
      steps: [
        {
          target: Q('editor-sections'),
          title: 'Edita el contenido',
          body:
            'Cada bloque del panel izquierdo es una sección. Doble click en el título para renombrarla; arrastra para reordenar.',
          placement: 'right',
          route: editorRoute || undefined,
        },
      ],
    }
  }

  const skipFloatingBar = role === 'content_writer'

  return {
    id: 'edit_page',
    onComplete: () => markTaskDone('edit_page'),
    onSkip: () => markTaskDone('edit_page'),
    steps: [
      {
        target: Q('editor-pages'),
        title: 'Páginas',
        body:
          'Una página web puede tener varias páginas (Inicio, Servicios, Contacto…). Cambia entre ellas con estas pills. El botón + agrega una nueva.',
        placement: 'bottom',
        route: editorRoute || undefined,
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

// ─── Comparte un link público ───────────────────────────────────────
// Spotlight ON the editor's "Crear link privado" CTA — info only,
// does NOT actually create a link.
export function buildShareLinkTour(ctx = {}) {
  const { projectId = null } = ctx
  const editorRoute = projectId ? `/project/${projectId}/editor` : null

  if (!editorRoute) {
    return {
      id: 'create_share_link',
      onComplete: () => markTaskDone('create_share_link'),
      onSkip: () => markTaskDone('create_share_link'),
      steps: [
        {
          target: null,
          title: 'Comparte un link público',
          body:
            'Necesitas un proyecto para probar esto. Vuelve cuando hayas creado uno y mostraré dónde está el botón "Crear link privado" en el editor.',
          placement: 'bottom',
        },
      ],
    }
  }

  return {
    id: 'create_share_link',
    onComplete: () => markTaskDone('create_share_link'),
    onSkip: () => markTaskDone('create_share_link'),
    steps: [
      {
        target: Q('editor-share-link'),
        title: 'Comparte un link público',
        body:
          'Desde aquí generas un link privado para enviar al cliente. Lo puede ver y comentar sin necesidad de cuenta. Cada link tiene su propio control de permisos. (Esto es solo informativo — pulsa Listo para continuar.)',
        placement: 'left',
        route: editorRoute,
      },
    ],
  }
}

// ─── Deja un comentario ─────────────────────────────────────────────
// Spotlight ON the editor content with copy explaining the gesture.
// Info only — does NOT force the user to add a real comment.
export function buildLeaveCommentTour(ctx = {}) {
  const { projectId = null } = ctx
  const editorRoute = projectId ? `/project/${projectId}/editor` : null

  if (!editorRoute) {
    return {
      id: 'leave_comment',
      onComplete: () => markTaskDone('leave_comment'),
      onSkip: () => markTaskDone('leave_comment'),
      steps: [
        {
          target: null,
          title: 'Deja un comentario',
          body:
            'Necesitas un proyecto para probar esto. Vuelve cuando hayas creado uno y mostraré cómo dejar comentarios anclados al texto.',
          placement: 'bottom',
        },
      ],
    }
  }

  return {
    id: 'leave_comment',
    onComplete: () => markTaskDone('leave_comment'),
    onSkip: () => markTaskDone('leave_comment'),
    steps: [
      {
        target: Q('editor-content'),
        title: 'Deja un comentario',
        body:
          'Selecciona texto dentro del editor y haz click derecho para anclar un comentario. Aparece en el hilo del panel derecho. Los clientes que entran por link público también pueden comentar. (Solo informativo — pulsa Listo para continuar.)',
        placement: 'top',
        route: editorRoute,
      },
    ],
  }
}

// ─── No-project fallback ────────────────────────────────────────────
// Used when edit_page is reached but no project exists.
// `onCreateNow` (passed in by TourContext) restarts the chain from
// create_project so the user lands in the guided form.
export function buildNoProjectFallback(ctx = {}) {
  const { onCreateNow } = ctx
  return {
    id: 'edit_page_no_project',
    onComplete: () => markTaskDone('edit_page'),
    onSkip: () => markTaskDone('edit_page'),
    steps: [
      {
        target: null,
        title: 'Necesitas un proyecto primero',
        body:
          'Para mostrar cómo editar una página, primero hay que crear un proyecto. Pulsa "Crear con tutorial" para abrir el formulario guiado, o "Saltar" para continuar con los siguientes pasos del tutorial.',
        placement: 'bottom',
        nextLabel: 'Crear con tutorial',
        skipLabel: 'Saltar este paso',
        onAdvance: () => {
          if (typeof onCreateNow === 'function') onCreateNow()
        },
      },
    ],
  }
}
