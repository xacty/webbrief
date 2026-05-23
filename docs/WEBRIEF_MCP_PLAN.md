# WeBrief MCP Plan

## Resumen

El MCP de WeBrief permitira que clientes compatibles operen la app como un usuario asistido. El objetivo de v1 es crear proyectos desde contenido, prellenar briefs, generar estructura y borrador inicial, leer proyectos/paginas y editar contenido existente con confirmacion.

La v1 sera local para `Codex` y `Claude` usando `stdio`. La v2 sera remota usando `HTTP/SSE`, preparada para clientes futuros como `ChatGPT`.

## Dependencias Previas

- La seguridad base de WeBrief debe cubrir al menos los puntos criticos de auth, rate limiting, autorizacion, validacion y auditoria antes de habilitar mutaciones MCP.
- El MCP debe operar en nombre de un usuario real de WeBrief.
- El backend debe seguir siendo la fuente de verdad para permisos, empresas, proyectos, brief templates, paginas y actividad.
- Si una capacidad no existe como servicio o endpoint seguro, se agrega primero en backend y despues se expone via MCP.
- Antes de cualquier mutacion MCP debe existir un proyecto Supabase de desarrollo separado del de produccion para no probar escrituras contra datos reales.
- Antes de la Fase 3 debe estar definida la estrategia de edicion granular (full-page replace computado por MCP vs endpoints PATCH server-side). Sin esa decision las tools de edicion no tienen base ejecutable.
- Los invariantes del documento (`sectionDivider` en cada seccion, numeracion contigua, estructura FAQ, CTAs semanticos) deben enforzarse server-side o en una libreria compartida importable desde MCP. Hoy solo viven en extensiones de TipTap del frontend.

## Compatibilidad De Clientes

- `Codex`: objetivo principal de v1 mediante MCP local por `stdio`.
- `Claude`: objetivo principal de v1 mediante MCP local por `stdio`.
- `ChatGPT`: objetivo posterior de v2 mediante integracion remota/app-style, no alcance de v1.
- Otros clientes MCP remotos: considerar despues de tener `HTTP/SSE`, autenticacion remota, permisos y auditoria listos.

## Arquitectura

- El MCP vivira dentro del repo principal en `/Users/adrian/GitHub/webbrief/mcp/webrief-server`.
- No se crea un repo separado en v1.
- El MCP debe compartir contratos, enums o schemas con `shared/` cuando eso evite duplicar reglas de WeBrief.
- El transporte v1 sera `stdio`: el cliente MCP arranca el proceso local y se comunica por entrada/salida estandar.
- El transporte v2 sera `HTTP/SSE`: el MCP podra montarse como servicio remoto, potencialmente detras de Nginx en el VPS.
- El MCP no debe exponer SQL libre, shell libre, fetch arbitrario ni edicion general del filesystem.
- Las mutaciones deben pasar por backend o servicios compartidos que preserven permisos, versionado y auditoria.

## Alcance Funcional V1

- Recibir texto pegado y URLs de referencia como input.
- Soportar los tipos de proyecto existentes: `page`, `brief`, `document` y `faq`.
- Sugerir nombre de proyecto y permitir confirmarlo antes de crear.
- Detectar o confirmar `projectType`.
- Sugerir `businessType` cuando el proyecto sea `page`.
- Crear proyectos nuevos usando flujo `preview -> confirm -> apply`.
- Prellenar respuestas de brief usando preguntas existentes.
- Generar estructura y borrador inicial para `page`, `document` y `faq`.
- Leer proyectos y paginas existentes.
- Editar contenido existente con preview y confirmacion.

## Politica De Fetch De URLs

- El cliente MCP puede pasar URLs de referencia como input para creacion o edicion.
- El servidor MCP es quien fetchea esas URLs; el cliente no envia el contenido descargado.
- Solo se aceptan URLs `http` y `https`.
- Timeout maximo: 10 segundos por URL.
- Tamano maximo de respuesta: 2 MB.
- No se siguen redirects a `localhost` ni a rangos privados (RFC 1918) para evitar SSRF.
- No se envian credenciales ni headers de autenticacion en el fetch.
- En v2 HTTP/SSE este control es critico porque el servidor MCP estara expuesto.

## Autenticacion MCP Local

- El backend hoy solo acepta tokens bearer de Supabase Auth con TTL aproximado de 1 hora. Eso no es viable para un proceso MCP local que debe operar de forma continua.
- V1 introducira un `MCP token` de larga duracion emitido desde la UI de Settings y persistido contra el usuario que lo crea.
- El backend reconocera ese token via middleware nuevo, manteniendo la identidad del usuario, sus empresas y permisos como si fuera bearer Supabase.
- El usuario pega ese token en la configuracion de su cliente MCP (Codex/Claude) una sola vez.
- El token debe poder revocarse desde la UI y debe quedar auditado en `security_events`.
- En v2 (HTTP/SSE) el mismo modelo aplica, posiblemente extendido con device flow u OAuth, pero el contrato base no cambia.

## Seguridad MCP

- El MCP depende de la seguridad base de la app antes de habilitar escrituras.
- La identidad de usuario es obligatoria para cualquier tool que lea o escriba datos privados.
- Si el usuario tiene una sola empresa activa, el MCP puede usarla por defecto.
- Si el usuario tiene varias empresas activas, el MCP debe exigir seleccion explicita antes de crear o mutar proyectos.
- Toda escritura usa `preview -> confirm -> apply`.
- Toda mutacion debe registrar actor, empresa, proyecto, tool, resumen, resultado y timestamp.
- Las escrituras deben usar `expectedVersion` o un mecanismo equivalente cuando editen contenido existente.
- El MCP debe tener rate limits, timeouts y errores estructurados propios, ademas de los controles del backend.
- El MCP server no realiza llamadas a LLMs. La generacion de contenido (estructura inicial, borradores, prefill) la hace el cliente MCP (Codex/Claude). El servidor solo expone tools y aplica mutaciones validadas.
- El MCP debe forwardear el token del usuario al backend en cada llamada para que el rate limiting, los permisos y la auditoria del backend apliquen naturalmente. El rate limiting propio del MCP es defensa en profundidad, no control primario.
- El MCP no opera proyectos archivados ni en papelera. Restore se hace via UI.
- El MCP no maneja uploads de assets ni transformaciones de media en v1. Las imagenes se suben via UI (pipeline ImageKit); el MCP puede referenciar URLs publicas ya existentes via `insert_image_by_url` (v1.1).
- Side-effect deseable: introducir logger estructurado (pino) cuando se monte el MCP. Hoy el backend usa solo `console.log`.

## Tools V1

- `session.getContext`
- `companies.selectActive`
- `projects.previewCreateFromContent`
- `projects.createFromPreview`
- `brief.previewPrefill`
- `pages.previewDraft`
- `projects.get`
- `pages.get`
- `pages.previewEdits`
- `pages.applyEdits`

Notas sobre las tools:

- Las tools de edicion se llaman `pages.*` para evitar colision con `project_type='document'` (Articulo). La unidad mutable real es `project_pages`.
- Toda tool que muta requiere `companyId` explicito en parametros. `companies.selectActive` solo provee un default por sesion, no un binding obligatorio.
- `pages.applyEdits` recibe `expectedVersion` por pagina y devuelve `409 { code: 'version_conflict', currentVersion, currentSnapshot }` cuando hay conflicto. El cliente puede replanear el patch con el snapshot devuelto.

## Edicion De Contenido Existente

La v1 debe permitir cambios sobre proyectos ya creados, especialmente `document`, `page` y `faq`, siempre con preview y confirmacion.

Operaciones contempladas:

- Cambiar un titulo.
- Cambiar varios titulos.
- Reemplazar un parrafo.
- Insertar una seccion.
- Eliminar una seccion.
- Renombrar una pagina.
- Ejecutar reemplazos masivos controlados.
- Editar pregunta/respuesta en FAQ.

Cada edicion debe preservar:

- `content_json`
- `content_html`
- versionado o control de conflicto
- activity/auditoria
- permisos por usuario, empresa, proyecto y rol

Aclaraciones de scope:

- La edicion de FAQ se refiere a `project_type='faq'`.
- En `project_type='brief'` la edicion v1 cubre solo respuestas. Las preguntas son del template y no se editan via MCP.
- Estrategia elegida para v1: **A** — el MCP computa el `content_json` completo localmente y reenvia la pagina entera por el endpoint existente (`PUT /api/projects/:id/pages`). Requiere replicar los invariantes del documento en una libreria compartida (`shared/documentInvariants.js`).
- Estrategia B (PATCH endpoints granulares server-side) queda diferida a post-v1. Razon: en v1 muchas operaciones del save dependen del flujo full-page (auditoria, notificaciones, version conflict, activity log); endpoints quirurgicos exigen replicar todo eso por cada PATCH. La migracion a B se puede hacer incrementalmente, un endpoint por vez, sin rehacer el MCP.

## Fases

### Fase 0: Contratos Y Scaffolding

- Crear estructura `mcp/webrief-server`.
- Definir scripts, README, `AGENTS.md` y `CLAUDE.md` especificos del MCP.
- Definir contratos de input/output para tools v1.
- Identificar que schemas deben vivir en `shared/`.

### Fase 1: Lectura Y Contexto

- Implementar `session.getContext`.
- Implementar seleccion de empresa activa.
- Implementar lectura de proyectos y paginas.
- Confirmar permisos usando backend o servicios compartidos.

### Fase 2: Creacion Desde Contenido

- Implementar preview de creacion desde texto y URLs de referencia.
- Implementar apply de preview aprobado.
- Soportar `page`, `brief`, `document` y `faq`.
- Prellenar brief y generar estructura/borrador inicial.

### Fase 3: Edicion De Contenido Existente

- Implementar preview de ediciones granulares.
- Implementar apply con control de version.
- Preservar `content_json`, `content_html`, actividad y auditoria.
- Cubrir cambios de titulos, parrafos, secciones, paginas y FAQ.

### Fase 4: MCP Remoto (en scope v1, no v2)

**Cambio respecto al plan original (2026-05-23)**: la fase remota se moviò
dentro de v1 para evitar que cada usuario tenga que clonar el repo y
mantener un path absoluto en su cliente MCP. La distribución será un
único endpoint HTTP en el VPS de WeBrief; los clientes se conectan con
una URL + su `mcpt_*` token, sin npm install ni binarios locales.

Decisiones:

- **Transporte**: `StreamableHTTPServerTransport` del SDK MCP (v1.29.0+).
  Compatible con Claude Code, Codex CLI, Claude Desktop. SSE legacy NO
  se implementa (deprecado en favor de Streamable HTTP).
- **Auth**: token bearer `mcpt_*` en `Authorization` header de cada
  request, validado por el `requireAuth` middleware existente del
  backend Express (fast-path `mcpt_` ya implementado en Prep A).
- **Montaje**: dentro del backend Express, en `POST /api/mcp`. Reusa el
  mismo proceso y middleware; cero overhead de proceso adicional.
- **Multi-tenant**: el server hoy es monolítico (env-scoped); pasa a
  per-request via `AsyncLocalStorage`. Cada handler recibe el token +
  `currentUser` del request actual; el state de "active company" se
  guarda en un `Map<token, companyId>` en lugar de variable global.
- **Stdio sigue funcionando**: `src/index.js` queda como fallback para
  desarrollo local y para usuarios que prefieran el modo offline.
- **Nginx**: el endpoint vive bajo el mismo dominio del backend; Nginx
  pasa el body raw + `Authorization` header. No requiere cambios
  sustanciales en el reverse proxy.
- **OAuth/device flow**: NO se implementa en esta vuelta. El `mcpt_`
  token actúa como API key. Si en el futuro hay multi-org / scopes
  complejos, se migra a OAuth sin romper el contrato de los tools.

## Validacion

- Usuario con una sola empresa: usa empresa por defecto y permite preview.
- Usuario con multiples empresas: exige seleccion explicita antes de escribir.
- Creacion de proyecto `page`, `brief`, `document` y `faq`.
- Brief: prefill usa preguntas existentes y no crea preguntas nuevas en v1.
- Page/document/faq: genera estructura y borrador inicial.
- Edicion existente: aplica cambios con `expectedVersion` valido.
- Conflicto de version: rechaza apply, devuelve error claro y entrega el snapshot actual para que el cliente pueda replanear.
- Permisos insuficientes: deniega lectura o escritura segun corresponda.
- Auditoria: toda mutacion queda registrada con tool y actor.
- Brief: prefill matchea preguntas por id, valida tipo (`short_text`, `long_text`, `single_choice`, `multiple_choice`) y opciones permitidas. Las preguntas `file_upload` y `section_header` quedan fuera de scope de prefill v1.
- Token MCP invalido o revocado: deniega cualquier operacion antes de tocar backend.
- URLs de referencia: rechaza `file://`, `data:`, hosts en rangos privados y respuestas mayores a 2 MB.
- Edicion sobre proyectos archivados o en papelera: deniega siempre.

## Supuestos

- V1 no busca productizar ChatGPT todavia.
- V1 vive dentro del repo principal.
- V1 usa `stdio`.
- V2 remota por `HTTP/SSE` queda fuera de la implementacion inicial.
- El MCP opera contenido y proyectos de WeBrief, no deploy ni cambios arbitrarios de codigo.
- La seguridad base de la app se implementa antes de habilitar mutaciones MCP.
- V1 no maneja uploads de assets ni transformaciones de media. Las imagenes se suben via UI; desde v1.1 el MCP puede embeber URLs publicas ya subidas (`insert_image_by_url`) e insertar CTAs (`insert_cta`).
- V1 no opera proyectos archivados ni en papelera.
- El MCP server no llama a LLMs. Toda generacion la hace el cliente (Codex/Claude).
- Existe un proyecto Supabase de desarrollo separado del de produccion antes de habilitar mutaciones.

## Modelo Recomendado

Para ejecutar este plan via Claude Code, se recomiendan los siguientes modelos por fase. La eleccion balancea calidad de codigo contra costo de tokens.

| Fase | Modelo | Reasoning | Justificacion |
|---|---|---|---|
| Prep A (MCP token system) | Sonnet 4.6 | high | Patterns claros (migration, endpoints, middleware). Reasoning high como minimo para evitar bugs sutiles en auth. |
| Prep B (`shared/documentInvariants.js`) | **Opus 4.7** | **high** | Porteo desde frontend TipTap. Bug silencioso en invariantes rompe documentos en produccion semanas despues. Opus se justifica. |
| Fase 0 (Contratos + Scaffolding) | Sonnet 4.6 | high | Boilerplate de stdio + zod schemas. Pattern conocido. |
| Fase 1 (Lectura + Contexto) | Sonnet 4.6 | high | Read-only tools, validacion de auth, multi-empresa. Mecanico. |
| Fase 2 (Creacion desde contenido) | Sonnet 4.6 | high | URL fetching + project type detection + brief prefill. Patrones conocidos pero con varias ramas. |
| Fase 3 (Edicion existente) | **Opus 4.7** | **high** | Combinacion de invariantes + expectedVersion + conflict snapshot + 8 operaciones. El espacio de estados es el mas grande de v1. |
| Fase 4 (Remote V2) | TBD | TBD | Fuera de v1. Re-evaluar cuando se aborde. |

Reglas:

- Sonnet 4.6 reasoning `high` es el minimo para cualquier fase. No bajar a medium/low en este proyecto.
- Cambiar a Opus 4.7 reasoning `high` SOLO para Prep B y Fase 3.
- No usar Opus very-high/max: ganancia marginal sobre high, costo y latencia significativos.

## Proximos Pasos

- Antes de profundizar MCP, completar `Fase 2` del plan general: seguridad de la app.
- Despues de completar `Fase 2`, pasar a `Fase 3`: completar el plan MCP v1.
- Ver `docs/WEBRIEF_MCP_HANDOFF.md` para sequencing por sesion y modelo recomendado por unidad de trabajo.
