const PROJECT_TEMPLATES = {
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
      review_status: 'draft',
    }
  })
}
