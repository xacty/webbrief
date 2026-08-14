# HANDOFF — Sanitización server-side de SVG en la ingesta (WeBrief)

Fecha: 2026-08-13. Estado: implementado, testeado y committeado. NO mergeado, NO deployado.
Documento de traspaso entre agentes; leer completo antes de continuar el trabajo.

## Qué existe ahora

- Rama: `fix/security-svg-sanitization`, commit único `673a765`, basada en `feat/image-library`
  HEAD (`284ffe9`). Vive en el git compartido de `/Users/adrian/GitHub/webbrief`
  (se creó desde un worktree; la rama es visible con `git branch` desde el repo principal).
- Working tree de esa rama limpio; todo el cambio está en ese commit (9 archivos, +999).
- Dependencias backend nuevas: `dompurify@^3.4.13` + `jsdom@^29.1.1`.

## Problema que cierra

Los SVG subidos eran passthrough sin sanear. Servidos desde ik.imagekit.io (o almacenados en
el bucket `brief-documents`), al abrir la URL directa el navegador ejecutaba `<script>`,
manejadores `on*`, `javascript:` en href y HTML en `<foreignObject>`. Embebido vía `<img>` no
ejecuta, pero la URL directa sí.

Superficies reales de entrada de SVG: **4, no 3** (hallazgo de la sesión):

1. Biblioteca — `backend/src/routes/library.js` POST `/assets` → `uploadWithIngest` → ImageKit
2. Editor — `backend/src/routes/projects.js` POST `/:id/assets` → `uploadWithIngest` → ImageKit
3. Brief interno — `projects.js` POST `/:id/brief/documents` → **NO pasa por uploadWithIngest**,
   sube directo al bucket privado Supabase `brief-documents`
4. Brief público — `backend/src/routes/public.js` POST `/brief/:token/documents` → ídem 3

No son superficies: avatares (solo raster), MCP `assets_convertAndSave` (rechaza SVG).

## Implementación

Lib nueva: `backend/src/lib/svgSanitizer.js`. Exporta `sanitizeSvg(text)`,
`sanitizeSvgBuffer(buffer)`, `sanitizeIfSvg({ mimeType, buffer })` (passthrough para mime
no-SVG) y `SVG_MIME_TYPE`. Retorna `{ ok, svg|buffer, changed }` o
`{ ok: false, reason: 'invalid_svg' }`.

Pipeline (el orden importa; decisiones validadas empíricamente):

1. Strip **lineal con indexOf** (no regex con backtracking) de prólogo XML, DOCTYPE (incluido
   subset `[...]`) y comentarios/PIs de cabecera → anti-XXE/billion-laughs y anti-ReDoS.
2. Validación XML estricta de entrada (`DOMParser` con `image/svg+xml`, raíz `<svg>` exigida) —
   espejo de lo que hace el navegador; lo que no parsea se rechaza 400 en vez de almacenarse roto.
3. DOMPurify **en modo HTML** con `USE_PROFILES {svg, svgFilters}` + `FORBID_TAGS/FORBID_CONTENTS
   ['script','foreignObject']` + `ADD_TAGS ['use']` + `RETURN_DOM`. OJO: NO usar
   `PARSER_MEDIA_TYPE 'application/xhtml+xml'` — se probó y las allowlists internas en minúsculas
   de DOMPurify destruyen `viewBox`, `linearGradient`, `feGaussianBlur`, `preserveAspectRatio`.
   El parser HTML normaliza el case y todo sobrevive.
4. `<use>` está excluido del perfil SVG de DOMPurify a propósito; se readmite con un hook
   `afterSanitizeAttributes` que limita `href`/`xlink:href` a fragmentos internos `#id`.
5. Serialización con `XMLSerializer` (escapa `<` en atributos, auto-declara `xmlns:xlink`) +
   re-parseo final como garantía: todo SVG almacenado es XML bien formado sin contenido activo.

Wiring:

- `backend/src/lib/imageIngest.js:58` — `uploadWithIngest` sanea todo SVG antes de subir
  (cubre superficies 1 y 2 y cualquier caller futuro).
- `backend/src/routes/public.js:534` y `backend/src/routes/projects.js:2782` — saneo explícito
  del buffer antes del upload a `brief-documents` (superficies 3 y 4); `file_size` refleja el
  buffer saneado.
- Mensajes 400 nuevos («El SVG no es válido o contiene contenido activo no permitido») en
  editor y biblioteca; código de error `invalid_svg`.

## Tests

- `backend/test/svg-sanitizer.test.js` (22) + 3 nuevos en `backend/test/image-ingest.test.js`.
  Cubren: script/on*/javascript:/foreignObject/SMIL/data:-URIs/PIs/DOCTYPE/BOM/xlink/use
  externo/mal formado/multi-raíz/binario + **anti-ReDoS** (entradas patológicas de 2 MB deben
  rechazarse en <5 s; antes de la corrección, 30k chars tardaban 1.3 s por backtracking cuadrático).
- Correr con `cd backend && npm test` → estado verificado al commitear: **303/303 pass**.

## Auditoría de datos existentes (2026-08-13) — nada que re-sanitizar

- `project_assets` (mime svg, kind svg o `%.svg`): **0 filas en Dev, 0 en Prod** (solo SELECT).
- ImageKit, cuenta completa (prefijos dev/ y prod), vía `assets.list` con `format="svg"`:
  **0 archivos**.
- `storage.objects` de Supabase no se pudo consultar (bloqueado por permisos de la sesión).
  Residuo teórico: objetos huérfanos sin fila en DB — en `brief-documents` inaccesibles (bucket
  privado) y en el bucket público legacy las rutas llevan doble UUID no adivinable. Chequeo
  manual opcional: `SELECT bucket_id, name FROM storage.objects WHERE lower(name) LIKE '%.svg'`.

## Pendiente (decisiones del owner — NO ejecutar sin pedido explícito)

1. **Merge**: verificado con `git merge-tree` en seco — mergea limpio en `feat/image-library`
   (fast-forward) y en `feat/project-folders` (contiene a image-library).
2. **¿Cherry-pick a `main`?** Editor y brief público YA están vulnerables en Prod (F0/v2.12.0).
   El cherry-pick de `673a765` a main tiene 2 conflictos menores: descartar el cambio de
   `library.js` (no existe en main) y resolver `projects.js` (divergió con F1).
3. **Versionado** (regla del repo: bump en `frontend/package.json`): si viaja dentro de
   `feat/image-library` cabalga la v2.13.0 ya declarada ahí (sin bump extra); si va a main
   por separado, corresponde **v2.12.1 (patch)** en ese momento.
4. **Interacción con `fix/security-s1-xss-sanitization`** (S1, sin mergear): criterios ya
   unificados (familia DOMPurify: frontend `dompurify`, HTML backend `sanitize-html`, SVG backend
   `dompurify+jsdom`). Al mergear ambas habrá conflicto trivial de unión en `backend/package.json`
   (ambas agregan deps).

## Reglas del repo a respetar

Español neutro (no argentinismos); jamás tocar Prod ni deployar sin pedido explícito; nada de
git destructivo sin confirmación; migraciones/datos solo en Supabase Dev. La memoria persistente
del proyecto ya registra este estado en `project_security_audit_2026_06.md`.
