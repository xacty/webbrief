const PROJECT_TEMPLATES = {
  tabula_rasa: {
    label: 'Tabula rasa',
    pages: [
      { name: 'Inicio', sections: [] },
    ],
  },
  clinica: {
    label: 'Clinica / Salud',
    pages: [
      { name: 'Inicio', sections: ['Hero con llamada a la accion', 'Servicios principales', 'Equipo medico', 'Testimonios de pacientes', 'Ubicacion y contacto'] },
      { name: 'Servicios', sections: ['Lista de especialidades', 'Detalle por servicio', 'Preguntas frecuentes'] },
      { name: 'Equipo', sections: ['Presentacion del equipo', 'Perfil de cada profesional'] },
      { name: 'Contacto', sections: ['Formulario de consulta', 'Mapa y direccion', 'Horarios de atencion'] },
    ],
  },
  ecommerce: {
    label: 'E-commerce',
    pages: [
      { name: 'Inicio', sections: ['Banner principal / Ofertas', 'Categorias destacadas', 'Productos mas vendidos', 'Propuesta de valor', 'Newsletter'] },
      { name: 'Catalogo', sections: ['Filtros y busqueda', 'Grilla de productos', 'Paginacion'] },
      { name: 'Producto', sections: ['Galeria de imagenes', 'Descripcion y precio', 'Variantes', 'Productos relacionados'] },
      { name: 'Carrito / Checkout', sections: ['Resumen de compra', 'Datos de envio', 'Pago'] },
    ],
  },
  restaurante: {
    label: 'Restaurante',
    pages: [
      { name: 'Inicio', sections: ['Hero con ambiente', 'Propuesta gastronomica', 'Platos destacados', 'Reservas', 'Resenas'] },
      { name: 'Menu', sections: ['Categorias del menu', 'Platos con descripcion y precio'] },
      { name: 'Nosotros', sections: ['Historia del restaurante', 'Chef y equipo'] },
      { name: 'Contacto', sections: ['Formulario de reserva', 'Ubicacion y horarios', 'Redes sociales'] },
    ],
  },
  agencia: {
    label: 'Estudio / Agencia',
    pages: [
      { name: 'Inicio', sections: ['Hero con propuesta de valor', 'Servicios', 'Proyectos destacados', 'Clientes', 'Llamada a la accion'] },
      { name: 'Servicios', sections: ['Detalle de cada servicio', 'Proceso de trabajo'] },
      { name: 'Portafolio', sections: ['Grilla de proyectos', 'Filtro por categoria', 'Caso de estudio'] },
      { name: 'Nosotros', sections: ['Equipo', 'Cultura y valores'] },
      { name: 'Contacto', sections: ['Formulario', 'Datos de contacto'] },
    ],
  },
  inmobiliaria: {
    label: 'Inmobiliaria',
    pages: [
      { name: 'Inicio', sections: ['Hero con buscador', 'Propiedades destacadas', 'Por que elegirnos', 'Testimonios'] },
      { name: 'Propiedades', sections: ['Filtros de busqueda', 'Listado de propiedades', 'Mapa interactivo'] },
      { name: 'Propiedad', sections: ['Galeria', 'Descripcion y caracteristicas', 'Ubicacion', 'Formulario de contacto'] },
      { name: 'Nosotros', sections: ['Trayectoria', 'Equipo de asesores'] },
      { name: 'Contacto', sections: ['Formulario', 'Oficinas y sucursales'] },
    ],
  },
  educacion: {
    label: 'Educacion',
    pages: [
      { name: 'Inicio', sections: ['Hero con propuesta educativa', 'Cursos o programas', 'Metodologia', 'Testimonios de alumnos', 'Llamada a inscripcion'] },
      { name: 'Cursos', sections: ['Catalogo de cursos', 'Detalle del curso', 'Temario y docentes'] },
      { name: 'Nosotros', sections: ['Historia de la institucion', 'Equipo docente', 'Certificaciones'] },
      { name: 'Contacto', sections: ['Formulario de consulta', 'Preguntas frecuentes'] },
    ],
  },
  otro: {
    label: 'Otro',
    pages: [
      { name: 'Inicio', sections: ['Hero principal', 'Propuesta de valor', 'Servicios o productos', 'Llamada a la accion'] },
      { name: 'Nosotros', sections: ['Historia y mision', 'Equipo'] },
      { name: 'Servicios', sections: ['Descripcion de servicios', 'Preguntas frecuentes'] },
      { name: 'Contacto', sections: ['Formulario', 'Datos de contacto'] },
    ],
  },
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function createSectionSeed(name) {
  const sectionId = crypto.randomUUID()
  return {
    id: sectionId,
    name,
    contentHtml: `<h2>${escapeHtml(name)}</h2><p></p>`,
    contentJson: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: name }] },
      { type: 'paragraph' },
    ],
  }
}

function buildPageDocument(sections) {
  if (sections.length === 0) {
    const sectionId = crypto.randomUUID()
    return {
      html: `<div data-section-divider data-section-id="${sectionId}" data-section-name="Sección 1"></div><p></p>`,
      json: {
        type: 'doc',
        content: [
          {
            type: 'sectionDivider',
            attrs: {
              sectionId,
              sectionName: 'Sección 1',
            },
          },
          { type: 'paragraph' },
        ],
      },
    }
  }

  return {
    html: sections.map((section) => (
      `<div data-section-divider data-section-id="${escapeHtml(section.id)}" data-section-name="${escapeHtml(section.name)}"></div>${section.contentHtml}`
    )).join(''),
    json: {
      type: 'doc',
      content: sections.flatMap((section) => ([
        {
          type: 'sectionDivider',
          attrs: {
            sectionId: section.id,
            sectionName: section.name,
          },
        },
        ...section.contentJson,
      ])),
    },
  }
}

export function getBusinessTemplate(businessType) {
  return PROJECT_TEMPLATES[businessType] || PROJECT_TEMPLATES.otro
}

export function seedProjectPages(businessType) {
  return seedProjectPagesForType('page', businessType)
}

// ---------------------------------------------------------------------------
// Brief templates — question seeds for brief project type
// ---------------------------------------------------------------------------

function briefQuestion(type, label, opts = {}) {
  return {
    id: crypto.randomUUID(),
    type,
    label,
    hint: opts.hint || '',
    required: opts.required !== false,
    options: opts.options || [],
  }
}

function briefSection(title) {
  return { id: crypto.randomUUID(), type: 'section_header', label: title, hint: '', required: false, options: [] }
}

const BRIEF_TEMPLATES = {
  tabula_rasa: {
    label: 'Tabula rasa',
    formTitle: 'Brief',
    formDescription: '',
    questions: [],
  },
  general: {
    label: 'General (Brief de inicio)',
    formTitle: 'Brief de Inicio de Proyecto',
    formDescription: 'Este brief nos ayudará a reunir la información esencial para comenzar el desarrollo de su proyecto web. Las preguntas son simples y rápidas de completar.',
    questions: [
      briefSection('SECCIÓN 1 — Información general del negocio'),
      briefQuestion('short_text', 'Nombre comercial del negocio'),
      briefQuestion('short_text', 'Nombre de la persona de contacto'),
      briefQuestion('short_text', 'Cargo o rol dentro del negocio'),
      briefQuestion('short_text', 'Teléfono de contacto'),
      briefQuestion('short_text', 'Correo electrónico de contacto'),
      briefQuestion('short_text', '¿Tienen slogan o frase corporativa?', { required: false }),
      briefQuestion('long_text', 'Describan su negocio en 2–3 oraciones'),
      briefQuestion('long_text', '¿Qué diferencia a su negocio de la competencia?', { required: false }),
      briefSection('SECCIÓN 2 — Objetivos del sitio web'),
      briefQuestion('multiple_choice', '¿Cuáles son los principales objetivos del nuevo sitio web?', {
        options: [
          'Ofrecer servicios (reservas, consultas, presupuestos, sesiones, citas)',
          'Vender productos online (eCommerce)',
          'Vender cursos online (eLearning)',
          'Captar clientes potenciales (formularios, WhatsApp, llamadas)',
          'Mostrar información institucional o corporativa',
          'Portafolio / catálogo de trabajos',
          'Automatizar procesos (confirmaciones, agendas, pagos)',
        ],
      }),
      briefQuestion('long_text', '¿Qué esperan lograr en los primeros meses después del lanzamiento?'),
      briefSection('SECCIÓN 3 — Identidad visual'),
      briefQuestion('single_choice', '¿Desean que trabajemos una propuesta de identidad visual adicional?', {
        options: ['Sí (se cotiza aparte)', 'No'],
      }),
      briefQuestion('long_text', 'Material gráfico disponible', {
        hint: 'Comparte enlaces a carpetas de Google Drive con íconos, ilustraciones, fotos, mockups u otros recursos visuales.',
        required: false,
      }),
      briefQuestion('multiple_choice', 'Selecciona el estilo visual y la percepción deseada de la marca', {
        options: ['Minimalista', 'Moderno', 'Elegante / Premium', 'Colorido / Creativo', 'Divertido / Juguetón', 'Corporativo', 'Profesional', 'Cercano / Amigable', 'Femenino', 'Neutral'],
      }),
      briefQuestion('long_text', 'Comparte 2–4 sitios web que te GUSTEN como referencia visual'),
      briefQuestion('long_text', 'Comparte 2–4 sitios que NO te gusten o no representen tu estilo', { required: false }),
      briefSection('SECCIÓN 4 — Estado actual del sitio'),
      briefQuestion('single_choice', '¿Existe un sitio web actualmente?', { options: ['Sí', 'No'] }),
      briefQuestion('short_text', 'Enlace del sitio actual', { required: false }),
      briefQuestion('long_text', 'Elementos que deseas mantener del sitio actual', { required: false }),
      briefQuestion('long_text', 'Elementos que deseas mejorar o eliminar', { required: false }),
      briefQuestion('long_text', 'Problemas actuales relevantes (errores, caídas, lentitud, seguridad)', { required: false }),
      briefSection('SECCIÓN 5 — Competencia y posicionamiento'),
      briefQuestion('long_text', 'Principales competidores del negocio'),
      briefQuestion('long_text', 'Enlace a sitios web de la competencia'),
      briefSection('SECCIÓN 6 — Contenidos del sitio'),
      briefQuestion('long_text', '¿El contenido de las páginas será entregado por el cliente o debe redactarse?', {
        hint: 'Indica para cada página si el contenido lo entregas tú o si debe redactarse por el equipo.',
        required: false,
      }),
      briefQuestion('short_text', 'Si incluye servicios, ¿cuántos servicios ofrecerá?', { required: false }),
      briefQuestion('short_text', 'Si incluye tienda online, ¿cuántos productos tendrá el catálogo?', { required: false }),
      briefSection('SECCIÓN 7 — Accesos necesarios'),
      briefQuestion('multiple_choice', 'Accesos que pueden proporcionar', {
        required: false,
        options: ['Dominio', 'Hosting', 'Redes sociales', 'Google Analytics', 'Google Search Console', 'Vimeo / Drive (para cursos)'],
      }),
      briefQuestion('long_text', '¿Cómo desean enviar los accesos?', { required: false }),
      briefSection('SECCIÓN 8 — Cronograma'),
      briefQuestion('short_text', 'Fecha ideal de lanzamiento del proyecto'),
      briefQuestion('long_text', 'Fechas importantes (eventos, campañas, temporadas altas)', { required: false }),
      briefSection('SECCIÓN 9 — Observaciones y aprobación'),
      briefQuestion('long_text', 'Observaciones adicionales', { required: false }),
      briefQuestion('single_choice', 'Confirmo que la información enviada es correcta para iniciar el proyecto', {
        options: ['Sí', 'No'],
      }),
    ],
  },
}

export function getBriefTemplate(templateKey) {
  return BRIEF_TEMPLATES[templateKey] || BRIEF_TEMPLATES.tabula_rasa
}

function seedBriefPage(templateKey = 'tabula_rasa') {
  const template = getBriefTemplate(templateKey)
  const briefData = {
    formTitle: template.formTitle,
    formDescription: template.formDescription,
    questions: template.questions,
  }
  return [{
    id: crypto.randomUUID(),
    name: template.formTitle || 'Brief',
    position: 0,
    content_html: '',
    content_json: briefData,
    seo_metadata: {},
    review_status: 'draft',
  }]
}

export function seedProjectPagesForType(projectType = 'page', businessType = 'otro') {
  if (projectType === 'brief') {
    return seedBriefPage(businessType)
  }

  if (projectType === 'document') {
    return [{
      id: crypto.randomUUID(),
      name: 'Documento',
      position: 0,
      content_html: '<p></p>',
      content_json: { type: 'doc', content: [{ type: 'paragraph' }] },
      seo_metadata: {},
      review_status: 'draft',
    }]
  }

  if (projectType === 'faq') {
    return [{
      id: crypto.randomUUID(),
      name: 'FAQs',
      position: 0,
      content_html: '<h1>Preguntas frecuentes</h1><h2>Pregunta Frecuente 1</h2><p>Respuesta de ejemplo.</p>',
      content_json: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Preguntas frecuentes' }] },
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Pregunta Frecuente 1' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Respuesta de ejemplo.' }] },
        ],
      },
      seo_metadata: {},
      review_status: 'draft',
    }]
  }

  const template = getBusinessTemplate(businessType)

  return template.pages.map((page, index) => {
    const sections = page.sections.map(createSectionSeed)
    const document = buildPageDocument(sections)

    return {
      id: crypto.randomUUID(),
      name: page.name,
      position: index,
      content_html: document.html,
      content_json: document.json,
      seo_metadata: {},
      review_status: 'draft',
    }
  })
}
