# Share link: auth-aware redirect + login desde el gate

- Fecha: 2026-07-24
- Versión objetivo: v2.7.0 (MINOR — nueva UX visible)
- Estado: aprobado por el usuario, en implementación

## Problema

`/share/:token` muestra a todos los visitantes el gate "Identifícate para comentar o aprobar",
incluso a usuarios con sesión iniciada y acceso a la empresa del proyecto. Además, un visitante
no logueado que sí tiene cuenta no tiene forma de ir a iniciar sesión desde esa pantalla.

## Comportamiento nuevo

| Visitante | Resultado |
|---|---|
| Logueado + acceso al proyecto | Redirect automático a `/project/:id/editor` (`replace: true`, sin flash del gate) |
| Logueado sin acceso | Vista de share auto-identificada con nombre/email del perfil (sin gate, sin "Cambiar datos") |
| Admin de plataforma con "Ver como → Cliente sin cuenta" | Vista pública con gate, tal como la ve un cliente (no redirige) |
| No logueado | Gate actual + "¿Ya tienes cuenta? Inicia sesión" → `/login?return_to=/share/<token>` |

## Decisiones de arbitraje

1. **Check de acceso liviano**: nuevo `GET /api/projects/:id/access` (autenticado) → `{ hasAccess: boolean }`,
   reusando `getProjectById(id, currentUser)` que ya encapsula toda la autorización (admin/QA global,
   memberships). Siempre 200 con booleano; no distingue "no existe" de "sin acceso" para no filtrar
   existencia de proyectos. Se descartó reusar `GET /api/projects/:id` como check porque descarga el
   proyecto completo (todas las páginas) dos veces en el camino al editor.
2. **Vista cliente para admins**: se honra el role-preview global existente. Detección en SharePage:
   `rolePreview === 'public_viewer' && realCurrentUser?.platformRole === 'admin'` → tratar como anónimo.
   El selector "Ver como" es y sigue siendo exclusivo de admins de plataforma (doble gate en
   `App.jsx` + `applyRolePreview`).
3. **Logueado sin acceso → auto-identify**: viewer efímero derivado de la sesión
   (`fullName || email` + `email`), sin persistir en localStorage y sin botón "Cambiar datos".
   Si el access check falla por red/500, se degrada a auto-identify (nunca bloquear la vista).
4. **`return_to` en Login**: se extiende el allowlist anti open-redirect existente
   (hoy solo `/oauth/authorize`) para aceptar rutas relativas que empiecen con `/share/`.
5. **Sin flash del gate**: SharePage muestra "Cargando contenido..." hasta que resuelven el fetch
   público + bootstrap de auth + access check.

## Archivos

- `backend/src/routes/projects.js` — nuevo handler `GET /:id/access` junto a `GET /:id`.
- `frontend/src/pages/SharePage.jsx` (+ `SharePage.module.css`) — matriz de decisión, link de login.
- `frontend/src/pages/Login.jsx` — allowlist de `return_to`.

## Verificación

- Backend: `npm test` en verde.
- Frontend: `npm run build` en verde; verificación en browser de la vista anónima; el redirect
  logueado se verifica con la sesión del usuario en el dev server (regla del repo: el agente no
  tipea credenciales).
