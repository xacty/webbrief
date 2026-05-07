# WeBrief Security Runbook

Updated: 2026-05-06.

## Fuentes

- App logs: PM2 process `webrief-backend`; logs son JSON para eventos de seguridad.
- DB audit: `public.security_events`.
- Admin shell: `/security` muestra overview, usuarios, IPs, eventos y bloqueos activos.
- DB blocks: `public.security_blocks` contiene bloqueos exactos de IP o usuario.
- Supabase Auth: login/reset abuse sigue visible principalmente en Supabase Auth logs/config, porque frontend llama Auth directo.
- Nginx: access/error logs del VPS para IP/rangos y volumen.

## Campos Minimos

- `requestId`: correlacion entre response header `X-Request-Id`, PM2 logs y `security_events.request_id`.
- `actor_user_id`, `actor_email`, `actor_role`.
- `ip_address`, `user_agent`.
- `action`, `resource_type`, `resource_id`, `company_id`, `project_id`, `target_user_id`.
- `outcome`: `success`, `denied`, `failed`.
- `metadata`: sin tokens, passwords ni secrets.

## Consultas Rapidas

Eventos recientes:

```sql
select created_at, action, outcome, actor_email, ip_address, resource_type, resource_id, request_id
from public.security_events
order by created_at desc
limit 100;
```

Rate-limit o probing sospechoso por IP:

```sql
select ip_address, action, outcome, count(*) as events, min(created_at), max(created_at)
from public.security_events
where created_at > now() - interval '24 hours'
group by ip_address, action, outcome
order by events desc
limit 50;
```

Acciones destructivas:

```sql
select created_at, action, actor_email, actor_role, company_id, project_id, resource_id, request_id
from public.security_events
where action in (
  'company_permanently_deleted',
  'project_permanently_deleted',
  'user_deleted'
)
order by created_at desc;
```

Share/brief spam:

```sql
select created_at, action, ip_address, project_id, metadata, request_id
from public.security_events
where action like 'public_%'
  and created_at > now() - interval '24 hours'
order by created_at desc
limit 200;
```

## Respuesta A Incidentes

Login/reset abuse:

- Revisar Supabase Auth logs y rate-limit/password policy.
- Confirmar `Site URL` y redirect allowlist.
- Si hay IP/rango claro, bloquear primero en Nginx o firewall.
- Si persiste, mover login/reset a backend proxy o activar challenge condicional.

Spam en brief/share:

- Buscar `public_%` en `security_events`.
- Identificar IP/rango, token/proyecto afectado y volumen.
- Revocar share/brief link si el token fue expuesto.
- Ajustar rate limits de `publicMutation`, `publicUpload` o `publicTokenProbe` antes de introducir CAPTCHA.
- Bloquear IP/rango en Nginx si el abuso es claro.

Bloqueo admin desde WeBrief:

- Usar `/security` para bloquear usuario o IP exacta con razon obligatoria.
- Preferir expiracion cuando el abuso parezca temporal.
- Confirmar en `security_events` el evento `security_ip_block_created`, `security_user_block_created` o `security_block_revoked`.
- Recordar que un bloqueo IP WeBrief corta `/api/*` y `/api/public/*`, pero no corta directamente login/reset de Supabase Auth.

Upload invalido:

- Revisar logs JSON `upload_rejected` y eventos `*_document_uploaded` / `project_asset_uploaded`.
- Confirmar MIME, extension y tamano.
- Si hay abuso repetido, bajar limite de `publicUpload` o bloquear IP/rango.
- No abrir buckets publicos para documentos privados.

Acceso cruzado o permiso denegado:

- Buscar `auth_*`, lifecycle y user/membership events por `request_id`, `actor_user_id`, `company_id` o `project_id`.
- Confirmar memberships activas y estado del recurso.
- Si hay bypass real, revocar sesiones desde Supabase Auth y corregir backend antes de reactivar el flujo.

Permanent delete accidental:

- Confirmar `*_permanently_deleted` en `security_events`.
- Revisar actor, requestId y recurso.
- Proyectos borrados eliminan assets best-effort; recuperar requiere backup externo/Supabase PITR si disponible.

## Retencion

- `security_events`: retener 180 dias por defecto.
- PM2/Nginx logs: retener al menos 30 dias o rotar con compresion.
- No registrar tokens, Authorization headers, passwords, payloads completos de brief, contenido HTML ni archivos.

Purge manual sugerido:

```sql
delete from public.security_events
where created_at < now() - interval '180 days';
```

## Checklist Post-Deploy

- Aplicar migracion `supabase/migrations/20260506_security_events.sql`.
- Aplicar migracion `supabase/migrations/20260506_security_blocks.sql`.
- Aplicar migracion `supabase/migrations/20260506_rate_limit_buckets.sql` si se va a usar `RATE_LIMIT_STORE=supabase`.
- Si `security_events` ya existia antes de Fase 3, aplicar tambien `supabase/migrations/20260506_security_events_request_id.sql`.
- Verificar que `GET /api/health` devuelva `X-Request-Id`.
- Verificar que `/api/public/brief/invalid-token` devuelva `X-Robots-Tag` y `X-RateLimit-*`.
- Ejecutar una accion sensible en staging/local y confirmar fila en `security_events`.
- Abrir `/security` con un admin y confirmar que carga datos propios aunque `get_auth_audit_events` devuelva warning.
- Crear un bloqueo IP de prueba, confirmar `403` en `/api/*` desde esa IP y revocar el bloqueo.
- Confirmar que PM2 muestra logs JSON para rate limit, auth denied y errores normalizados.

## Supabase Auth Hardening

Estos cambios se hacen en Supabase Dashboard/API, no desde Express mientras login/reset sigan directos desde el frontend.

- Confirmar redirect allowlist exacta: `http://localhost:5173/auth/set-password` y `https://webrief.app/auth/set-password`.
- Deshabilitar signup publico si no se usa autoservicio; WeBrief invita usuarios desde backend.
- Activar/ajustar email rate limits para password reset e invite flows.
- Configurar password policy minima: longitud >= 12, evitar passwords filtradas si la opcion esta disponible, requerir mezcla razonable de caracteres.
- Revisar expiracion de links OTP/invite/reset; evitar ventanas excesivamente largas.
- Revisar logs de Auth ante eventos `auth_token_invalid` o reportes de login/reset abuse.

## Rotacion De Credenciales

- Rotar cualquier credencial que haya estado en archivos `*.example`, historial Git, tickets o chats.
- Prioridad: Supabase service role, ImageKit private key, cualquier deploy key con permisos amplios.
- Despues de rotar, actualizar solo `.env` reales del VPS/local; no poner secretos en `.env.example` ni docs.
- Reiniciar PM2 backend y verificar `/api/health`.
- Buscar secretos en Git antes de publicar:

```bash
git grep -nE "(service_role|private_|SUPABASE_SERVICE_ROLE_KEY|IMAGEKIT_PRIVATE_KEY|eyJhbGci)" -- ':!backend/.env'
```

## Rate Limit Store Persistente

- Default: `RATE_LIMIT_STORE=memory`, suficiente para un PM2 single-process.
- Persistente: aplicar `supabase/migrations/20260506_rate_limit_buckets.sql` y usar `RATE_LIMIT_STORE=supabase`.
- Si la RPC persistente falla, backend registra `rate_limit_store_failed` y cae a memoria para no tirar la app.
- Usar `RATE_LIMIT_STORE=supabase` si hay multiples procesos PM2, multiples VPS o bypass medible entre restarts.
