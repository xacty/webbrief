# WeBrief Security Plan

## Estado Actual

WeBrief ya tiene autenticacion funcional con Supabase Auth, backend Express, permisos por usuario/empresa en areas principales y rutas publicas para brief/share. Todavia no hay una estrategia integral de hardening de producto que cubra rate limiting, antiabuso, validacion uniforme, auditoria de seguridad, headers, CORS y proteccion sistematica de endpoints publicos.

Este plan define la base minima de seguridad de la app completa. No es un plan exclusivo para el MCP: el MCP dependera de esta base antes de habilitar mutaciones.

## Objetivos

- Proteger cuentas de usuario, sesiones, invitaciones y recuperacion de password.
- Reducir abuso automatizado sobre login, reset password, formularios publicos, share links y brief publico.
- Reforzar autorizacion por empresa, proyecto, rol y estado del recurso.
- Mejorar validacion de inputs y limites de payload/upload.
- Dejar auditoria suficiente para acciones sensibles y mutaciones relevantes.
- Asegurar que la base pueda desplegarse en el VPS actual sin infraestructura pesada adicional.

## No Objetivos

- No introducir SSO enterprise en esta fase.
- No implementar WAF complejo ni una plataforma externa de seguridad como prerequisito.
- No redisenar por completo el modelo de autenticacion actual.
- No bloquear la evolucion del producto con controles enterprise antes de tener una base pragmatica.
- No habilitar mutaciones MCP hasta que los puntos criticos de seguridad esten cubiertos.

## Principios De Seguridad

- La seguridad aplica a toda la app: frontend, backend, Supabase, Storage, rutas publicas, operaciones admin y futuros clientes MCP.
- La prioridad inicial es una base pragmatica: auth, rate limiting, permisos, validacion, auditoria, headers, CORS, uploads y proteccion de rutas publicas.
- Los controles deben ser simples de operar en el VPS actual y faciles de validar localmente.
- Toda ruta sensible debe fallar cerrada: sin identidad, permiso, empresa o proyecto validos, no se ejecuta la accion.
- Los errores de autenticacion y autorizacion deben ser utiles para el usuario legitimo sin revelar informacion sensible.
- Las operaciones destructivas, publicas o de alto impacto deben dejar rastro auditable.

## Fases

### Fase 0: Hardening Inmediato

- Agregar rate limiting en login, reset password, invite-user, brief publico, share publico y endpoints de subida.
- Aplicar limites de payload, timeouts y tamanos maximos coherentes por tipo de endpoint.
- Revisar CORS por ambiente y cerrar origenes no necesarios.
- Agregar headers basicos de seguridad en backend/Nginx.
- Normalizar validacion de inputs para rutas sensibles.
- Reducir mensajes de error que permitan enumeracion de usuarios o recursos.

### Fase 1: Autorizacion Y Superficie Sensible

- Inventariar rutas por nivel de riesgo: publicas, autenticadas, manager/editor, admin y destructivas.
- Revisar permisos por empresa, proyecto, rol y estado del recurso.
- Verificar que empresas/proyectos archivados, en papelera o eliminados no puedan mutarse desde rutas no previstas.
- Reforzar lifecycle actions, invitaciones, cambios de rol, uploads, share links y brief submissions.
- Definir que acciones requieren auditoria explicita mas alla de la actividad normal de proyecto.

### Fase 2: Antibot, Antiabuso Y Antiscraping Basico

- Agregar throttling progresivo por IP y por usuario/email cuando aplique.
- Definir umbrales para bloqueo temporal por multiples intentos fallidos.
- Evaluar CAPTCHA o challenge solo en rutas con senal de abuso: login, reset, brief publico y share publico.
- Proteger rutas publicas contra scraping agresivo con limites, cache control y respuestas acotadas.
- Documentar excepciones necesarias para usuarios reales y workflows publicos legitimos.

### Fase 3: Observabilidad, Logs Y Respuesta A Incidentes

- Agregar logs estructurados para auth, permisos denegados, abuso, uploads y acciones criticas.
- Definir eventos minimos de seguridad y campos obligatorios: actor, IP, user agent, recurso, accion, resultado y timestamp.
- Crear guia corta de respuesta para abuso de login, spam en brief/share, subida invalida y acceso cruzado.
- Revisar retencion de logs y datos sensibles para evitar registrar secretos, tokens o contenido innecesario.

## Entregables Esperados

- Matriz de endpoints y riesgo.
- Backlog priorizado `P0`, `P1` y `P2`.
- Decisiones por capa: Nginx, backend Express, Supabase/Auth, Storage y frontend.
- Politica de rate limiting por familia de endpoints.
- Politica de validacion de inputs y limites de payload/upload.
- Politica de auditoria para acciones sensibles.
- Criterios de aceptacion por fase.

## Validacion

- Probar multiples intentos fallidos de login y verificar bloqueo o rate limit.
- Probar abuso sobre reset password e invitaciones.
- Probar abuso sobre brief publico y share publico.
- Confirmar denegacion de acceso cruzado entre empresas.
- Confirmar que roles no autorizados no accedan a rutas admin o manager.
- Probar uploads con MIME invalido, extension invalida y tamanos fuera de limite.
- Verificar CORS y headers de seguridad en local y produccion.
- Confirmar que acciones criticas dejan auditoria suficiente.

## Estado De Implementacion

Actualizado: 2026-05-06.

### Implementado En Fase 0

- Backend Express ahora deshabilita `X-Powered-By`, confia en un proxy Nginx (`trust proxy = 1`) y agrega headers base: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy` y HSTS en produccion.
- CORS queda cerrado a `FRONTEND_URL` y a la allowlist opcional `CORS_ORIGINS`; origenes no allowlisteados devuelven 403.
- `/api/public/*` usa limite de JSON mas bajo que el resto de la API: 256 KB para JSON y 64 KB para URL-encoded.
- Se agrego rate limiting en memoria, apto para el VPS actual, para rutas publicas, mutaciones publicas, uploads publicos, invitaciones y uploads autenticados.
- `POST /api/auth/invite-user` normaliza email/nombre, aplica rate limiting y devuelve error generico ante fallas internas para reducir enumeracion.
- Rutas publicas de share/brief validan formato de token antes de consultar DB.
- Comentarios, aprobaciones y submissions publicas normalizan email/texto, aplican maximos de longitud y validan el payload `answers`.
- Uploads publicos y autenticados quedan rate limited ademas de los limites MIME/extension/tamano existentes.
- Errores globales de JSON invalido, payload demasiado grande, CORS y Multer se normalizan en el middleware de errores.
- `backend/.env.production.example` ya no contiene credenciales reales de ImageKit y documenta `CORS_ORIGINS`.

### Brecha Conocida

- Login y reset password siguen ejecutandose directamente desde el frontend contra Supabase Auth. El rate limiting agregado en Express no cubre esas llamadas. Para cubrirlas hay dos opciones validas: configurar controles antiabuso en Supabase Auth, o mover login/reset a endpoints backend propios que actuen como proxy controlado.

### Implementado En Fase 1

- Se agrego `security_events` como tabla de auditoria para acciones sensibles con actor, IP, user agent, recurso, accion, resultado, timestamp y metadata acotada.
- El backend registra auditoria persistente para invitaciones, cambios de perfil/rol, cambios/remociones de memberships, solicitudes de eliminacion, borrado de usuarios, share links, brief share links, lifecycle de empresas/proyectos, uploads autenticados y acciones publicas relevantes de share/brief.
- La auditoria es tolerante a despliegues parciales: si la tabla todavia no existe, la accion no falla y el backend lo reporta por log.
- Se agrego rate limiting dedicado para share links y acciones sensibles autenticadas.
- Permanent delete de empresas/proyectos ahora falla cerrado si el recurso no esta en papelera.
- Restore de empresas/proyectos ahora exige que el recurso este archivado o en papelera.
- Archive/trash de empresas ahora valida estado actual y evita mezclar rutas de lifecycle.
- `supabase/schema.sql` y migraciones incluyen la tabla `security_events`.

### Implementado En Fase 2

- El rate limiting in-memory ahora es progresivo: cada violacion repetida dentro de la ventana de retencion duplica el bloqueo hasta un maximo por familia de endpoint.
- Se agrego `public-token-probe` antes de validar tokens publicos para que intentos de enumeracion con tokens invalidos tambien consuman cuota.
- Las rutas `/api/public/*` envian `Cache-Control: no-store`, `Pragma: no-cache` y `X-Robots-Tag: noindex, nofollow, noarchive`.
- Respuestas publicas quedan acotadas: share links devuelven como maximo 50 paginas y briefs publicos como maximo 80 preguntas.
- CAPTCHA/challenge queda como decision condicional, no implementada por defecto: solo debe activarse si `security_events`, logs o soporte muestran abuso real en login/reset/brief/share.
- Excepcion operativa: workflows publicos legitimos de cliente pueden completar brief/share sin cuenta ni challenge mientras respeten limites; si hay falsos positivos, ajustar ventanas antes de introducir CAPTCHA.

### Implementado En Fase 3

- Cada request recibe `requestId` y response header `X-Request-Id`; CORS expone ese header junto a `X-RateLimit-*`.
- `security_events` incluye `request_id` e indice para correlacionar DB audit con PM2/Nginx logs.
- Se agrego logging JSON estructurado para rate-limit blocks, CORS denials, payloads grandes, JSON invalido, uploads rechazados, errores no manejados y auth failures.
- `requireAuth` registra `auth_token_missing`, `auth_token_invalid` y `auth_validation_failed` como logs estructurados y eventos de auditoria no bloqueantes.
- `docs/WEBRIEF_SECURITY_RUNBOOK.md` documenta fuentes, queries, respuesta a incidentes, retencion y checklist post-deploy.
- Retencion recomendada: `security_events` 180 dias; PM2/Nginx logs al menos 30 dias con rotacion/compresion.

### Endurecimiento Continuo Implementado

- Se agregaron tests backend con `node:test` para request IDs, headers anti-scraping, rate limit progresivo y validadores publicos.
- `backend/package.json` incluye `npm test`.
- Se agrego store persistente opcional para rate limits: `RATE_LIMIT_STORE=supabase` usa RPC `consume_rate_limit`; si falla, el backend cae a memoria y registra `rate_limit_store_failed`.
- `supabase/migrations/20260506_rate_limit_buckets.sql` crea `rate_limit_buckets` y la funcion atomica `consume_rate_limit`.
- El runbook incluye checklist exacto para Supabase Auth hardening y rotacion de credenciales.
- Se agrego apartado admin-only `Seguridad` en el shell (`/security`) para overview, usuarios, IPs, eventos y bloqueos activos.
- Se agregaron endpoints admin-only `/api/security/*` para overview, timeline, usuarios, IPs, crear bloqueos y revocar bloqueos.
- Se agrego `security_blocks` para bloqueos exactos de IP o usuario, con razon obligatoria, expiracion opcional y revocacion auditada.
- Se agrego RPC `get_auth_audit_events` para normalizar `auth.audit_log_entries`; si no esta disponible, la UI responde con datos propios de WeBrief y warning.
- Enforcement v1: IP bloqueada corta temprano `/api/*` salvo `/api/health`; usuario bloqueado corta dentro de `requireAuth` despues de validar identidad.

## Matriz De Endpoints Y Riesgo

| Familia | Ejemplos | Riesgo | Control actual |
|---|---|---:|---|
| Public read | `GET /api/public/share/:token`, `GET /api/public/brief/:token` | Alto | token format guard, rate limit por IP |
| Public mutate | comentarios, aprobaciones, brief submit | Alto | rate limit por IP/token/email, validacion y limites |
| Public upload | `POST /api/public/brief/:token/documents` | Critico | rate limit, limite multipart 50 MB, MIME/ext whitelist, budget por proyecto |
| Auth invite | `POST /api/auth/invite-user` | Critico | auth requerida, permisos existentes, rate limit, validacion email |
| Auth uploads | assets, avatar, brief documents autenticados | Alto | auth/permisos existentes, rate limit, MIME/ext/tamano existente |
| Auth admin/users | `/api/users/*` | Alto | auth/permisos existentes, auditoria y rate limit en acciones sensibles |
| Lifecycle/destructive | archive/trash/restore/permanent delete | Critico | permisos existentes, rate limit, auditoria y guardrails de estado |
| Auth project mutations | pages, deliverables, share links, proposals | Alto | permisos existentes; validacion uniforme/auditoria dedicada queda P1 |
| Security admin | `/api/security/*` | Critico | admin-only, auditoria, bloqueos activos, warnings si falta Auth audit log |
| Supabase Auth direct | login/reset | Critico | no cubierto por Express ni bloqueos IP WeBrief; requiere Supabase Auth config, WAF/Nginx o proxy backend |

## Backlog Priorizado

### P0

- Configurar controles Supabase Auth para login/reset: email rate limits, password policy, redirect allowlist y protecciones contra signup/reset abuse.
- Rotar cualquier credencial real que haya estado en archivos example o historial Git.
- Revisar Nginx en produccion para replicar headers, `client_max_body_size`, timeouts y proxy IP forwarding.

### P1

- Centralizar validacion de payloads autenticados para projects/users/companies.
- Revisar rutas de templates/deliverables/proposals para decidir si pasan a auditoria de seguridad o quedan solo como actividad de producto.
- Automatizar purge/retencion de `security_events` si el volumen crece.

### P2

- Evaluar challenge/CAPTCHA condicional solo si hay senal real de abuso en login, reset, brief o share.
- Agregar alertas proactivas sobre eventos de seguridad criticos.

## Politicas Operativas

- Rate limiting actual es in-memory por proceso. Es suficiente para un PM2 single-process en el VPS; no es suficiente como unico control si se escala horizontalmente.
- Para persistencia entre procesos/restarts, aplicar `supabase/migrations/20260506_rate_limit_buckets.sql` y configurar `RATE_LIMIT_STORE=supabase`.
- Todos los rate limits son progresivos: violaciones repetidas duplican el bloqueo hasta el maximo definido por familia.
- Public token probe: 40 requests/10 minutos por IP, bloqueo base 15 minutos, maximo 6 horas.
- Public read: 90 requests/minuto por IP, bloqueo base 5 minutos, maximo 1 hora.
- Public mutate: 20 requests/10 minutos por IP/token/email, bloqueo base 15 minutos, maximo 6 horas.
- Public upload: 8 uploads/15 minutos por IP/token, bloqueo base 30 minutos, maximo 12 horas.
- Invite user: 20 intentos/hora por actor/IP/company, bloqueo base 1 hora, maximo 12 horas.
- Share links: 20 acciones/10 minutos por actor/IP/proyecto, bloqueo base 15 minutos, maximo 6 horas.
- Sensitive actions: 40 acciones/10 minutos por actor/IP/recurso, bloqueo base 15 minutos, maximo 6 horas.
- Auth upload: 30 uploads/10 minutos por usuario/IP/proyecto, bloqueo base 15 minutos, maximo 6 horas.
- Payload JSON publico: 256 KB. URL-encoded publico: 64 KB. API autenticada general: 1 MB. Uploads mantienen limites por endpoint.
- Bloqueos admin v1: exact-IP o usuario completo, razon obligatoria, expiracion opcional; no soporta CIDR ni GeoIP todavia.
- Limitacion: bloquear una IP en WeBrief no bloquea directamente endpoints de Supabase Auth mientras login/reset sigan llamando al proveedor desde frontend.

## Politica CAPTCHA / Challenge

- No se habilita CAPTCHA preventivo en esta fase para no degradar el flujo de clientes reales.
- Activadores para evaluar challenge: picos de `429`, muchos tokens invalidos desde una IP/rango, spam repetido en comentarios/brief submissions, abuso de reset/login confirmado por Supabase Auth.
- Orden recomendado antes de CAPTCHA: bajar umbrales por familia afectada, bloquear origen en Nginx si es claro, revisar logs/security_events, recien despues activar challenge condicional.

## Supuestos

- La prioridad es una base de seguridad buena, simple y mantenible.
- Las medidas deben poder desplegarse en el VPS actual.
- Supabase Auth sigue siendo el proveedor principal de autenticacion.
- La seguridad base de la app es prerequisito para habilitar mutaciones via MCP.
- El detalle tecnico profundo y el backlog implementable se completan en Fase 2.

## Proximos Pasos

- Siguiente fase: aplicar migraciones remotas y validar con datos reales de Supabase Auth audit logs.
- Objetivo recomendado: tests/integracion contra Supabase, Supabase Auth antiabuse para login/reset, alertas sobre `security_events`/`security_blocks`, MCP Supabase y rotacion de credenciales.
- Modelo recomendado: `GPT-5.5`.
- Thinking recomendado: `high`.
