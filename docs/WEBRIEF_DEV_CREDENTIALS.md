# WeBrief Dev — credenciales locales

Registro de cuentas usadas para automatización y QA en el proyecto Supabase **Dev** (`iimqxacagxuemwgaunis`). Las contraseñas **no** viven en este documento ni en el repo; se guardan localmente y quedan fuera de commits.

## Ubicación de las contraseñas

- Archivo local: `.claude/secrets/dev-credentials.env`
- Ignorado por git vía patrón `.claude/secrets/` en el `.gitignore` del repo.
- El archivo solo existe en la máquina del owner. Si otro colaborador necesita la contraseña, pídesela directamente; no se transmite por el repo.
- **Formato**: `KEY='value'` con comillas simples alrededor del valor. Sin comillas, cualquier carácter `$` seguido de otro carácter se expande como variable de shell al hacer `source` del archivo (ej: `pass$b` termina truncado a `pass`).

## Cuentas registradas

### `claude-bot@test.local`

- **Rol UI**: WeBrief Admin global.
- **Uso**: sesión de bot para que Claude ejecute revisiones y QA sobre WeBrief Dev (login flows, editor, comments, share links, etc.) sin usar la cuenta personal del owner.
- **Ambiente**: Supabase Dev únicamente. Nunca replicar en Prod (`gmrlhhszrdahcxyoywvt`).
- **Variables** en `dev-credentials.env`:
  - `CLAUDE_BOT_EMAIL`
  - `CLAUDE_BOT_PASSWORD`

## Reset de contraseña

Si la contraseña se pierde o rota:

1. Entrar como admin al `https://webrief.app` local (`http://localhost:5173`) o al dashboard de Supabase Dev.
2. Reset del password para `claude-bot@test.local` (link "Enviar acceso" en la lista de usuarios, o Auth → Users desde Supabase).
3. Actualizar `CLAUDE_BOT_PASSWORD` en `.claude/secrets/dev-credentials.env`.
4. No commitear.

## Reglas

- No pegar la contraseña en chats persistidos, memoria, ni en otros archivos del repo.
- No sincronizar `.claude/secrets/` a Dropbox/iCloud/servicios remotos sin cifrado.
- Cuando Supabase Dev se pause por inactividad (free-tier ~1 semana), el login fallará con "Failed to fetch" hasta restaurar el proyecto. Ver `CONTEXT.min.md` sección "New Data/Auth Baseline".
