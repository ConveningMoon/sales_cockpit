# CLAUDE.md — ITMANO Sales Cockpit

> Herramienta interna de prospeccion de Dylan (ITMANO). Este archivo es la fuente de
> verdad del proyecto y se carga al inicio de cada sesion de Claude Code.
>
> **Mantenlo vivo:** si una decision, estructura o regla cambia durante el trabajo
> (por un arreglo o una correccion de Dylan), actualiza este archivo en la misma sesion.

---

## 0. Principios de trabajo (NO NEGOCIABLES)

- **Pregunta antes de asumir.** Ante cualquier duda, ambiguedad o decision de diseno,
  PREGUNTA a Dylan antes de implementar. Nunca rellenes huecos con suposiciones.
- **Analisis profundo + estado actual primero.** Antes de tocar codigo, analiza a fondo
  la tarea y revisa el estado real del proyecto (que existe ya, que falta, que cambio).
  No asumas que el estado coincide con lo planeado.
- **Diagnostico antes de cambiar (Fase 0 -> PARAR).** Para cualquier tarea:
  1) diagnostica y explica que vas a hacer y por que, 2) PARA y espera confirmacion,
  3) recien entonces implementa. No saltes directo a escribir codigo.
- **PRs pequenos y enfocados.** Una unidad revisable a la vez. Nada de cambios masivos
  en un solo paso.
- **Confirma arquitectura antes de implementar.** Si una decision de arquitectura no esta
  confirmada por Dylan, presentala como opciones y espera su eleccion.
- **Nada destructivo sin confirmacion.** No borres ni recomputes datos existentes sin
  permiso explicito.
- **Higiene de ramas.** Trabaja en ramas limpias desde un origin actualizado; usa rebase
  cuando corresponda.
- **Actualiza este CLAUDE.md** cuando una decision o estructura cambie.
- **Idioma:** todo output orientado al usuario final (mensajes, copy, strings visibles)
  en **espanol neutro latino**, sin modismos regionales. Comentarios y docs en espanol;
  identificadores de codigo en ingles.

---

## 1. Que es este proyecto

Herramienta interna de **un solo usuario** (Dylan) para automatizar su prospeccion B2B en
LinkedIn y eliminar el trabajo manual de copy-paste entre LH2, hojas de calculo y chats de
IA. **Objetivo prioritario: ahorrar tiempo.**

Hoy Dylan scrapea perfiles con Linked Helper 2 (LH2), los clasifica y enriquece con IA,
genera mensajes de outreach, y responde a mano cada conversacion pegando prompts en chats
separados. Esta app centraliza todo: ingiere, clasifica, genera borradores automaticos por
lead y los deja listos para que Dylan los envie manualmente.

**Limite clave:** LH2 sigue siendo quien envia los mensajes en LinkedIn. Esta app es el
**cerebro** (datos + IA + orquestacion); LH2 son **las manos**. No reconstruir el envio en
LinkedIn (riesgo de baneo, sin beneficio).

---

## 2. Stack

- Next.js 15 (App Router) + React + TypeScript
- Tailwind v4 + shadcn/ui
- Supabase (PostgreSQL) como base de datos
- `@anthropic-ai/sdk` v0.104.2 (Claude directo) + `openai` v6 apuntando a OpenRouter (multi-proveedor)
- Resend (opcional, notificaciones)

---

## 3. Despliegue, auth e IA

**Despliegue: Vercel (a partir de la reestructuracion pre-Slice 4).**
La app corre en Vercel (HTTPS). Supabase es la DB cloud. El flujo de ingesta de respuestas
pasa a ser manual (pegado en el cockpit), no por webhook. `pnpm dev` sigue siendo el entorno
de desarrollo local.

**Auth single-user: password + cookie HMAC.**
- Un middleware de Next.js corre en Edge y protege todas las rutas excepto `/login` y `/api/auth/*`.
- Login: `POST /api/auth/login` — verifica `APP_PASSWORD` con `timingSafeEqual` (tiempo constante),
  rate-limit de 10 intentos / 15 min por IP, delay minimo de 500 ms en fallos, devuelve
  cookie `app-session` firmada con HMAC-SHA256 (Web Crypto) con expiracion de 7 dias.
- Session token: JWT minimo (`header.payload.signature`) — firma verificada con `crypto.subtle.verify`
  (constant-time) + check de expiracion. `src/lib/auth/session.ts` usa solo Web Crypto (edge-safe).
- Rutas `/dev/*` y `/api/dev*` redirigen a `/` en produccion (Vercel).
- Env vars de auth: `APP_PASSWORD` (la contrasena), `APP_SECRET` (32 bytes hex para HMAC, no cambiar).

**Seguridad de datos (CRITICO — RLS apagado en DB):**
- `SUPABASE_SERVICE_ROLE_KEY` permanece **solo en el servidor** (env var privada, nunca `NEXT_PUBLIC_*`).
- `SUPABASE_URL` es privada (`SUPABASE_URL`, no `NEXT_PUBLIC_SUPABASE_URL`).
- **Ningun acceso a DB client-side.** Todo acceso a datos pasa por endpoints server-side autenticados.
- El cliente browser de Supabase (anon key) fue eliminado. No recrear.
- Cualquier endpoint de datos que no pase por el middleware de auth es un bug de seguridad.

**Inferencia: dos proveedores (Slice 2 — IMPLEMENTADO).**
- **Anthropic directo** via `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY`. Modelo default para
  generacion: `claude-sonnet-4-6`. Modelo default para clasificacion: `claude-haiku-4-5-20251001`.
- **OpenRouter** via cliente `openai` apuntando a `https://openrouter.ai/api/v1` + `OPENROUTER_API_KEY`.
  Accede a Kimi K2.6 (`moonshotai/kimi-k2.6`), DeepSeek V4 Flash, Gemini 2.5 Flash Lite, y otros.

**Router de modelos (`lib/ai/`).** Toda llamada de IA pasa por `callAI()` que elige proveedor
+ modelo segun `task_type` y `model` override. Ruteo por defecto:
- `clasificacion` / `market_data` / `other` -> Haiku 4.5 (Anthropic, barato)
- `outreach` / `draft` -> Sonnet 4.6 (Anthropic, calidad)
Cada llamada se registra en `ai_usage` de forma no bloqueante.

**Catalogo de modelos (`lib/ai/models.ts`).** 5 modelos activos con flags `supportsWebSearch`
y `supportsCaching`. Anadir modelos aqui; el router los elige por id.

**Busqueda web:**
- Claude directo: tool `web_search_20260209`, $0.01/busqueda. Solo Sonnet 4.6+ (Haiku no).
- OpenRouter: `plugins: [{id:"web"}]` via Exa, $0.005/req. Funciona con cualquier modelo.
- El router rechaza con error claro si se pide `webSearch=true` en modelo sin soporte.

**Caching de prompts:**
- Anthropic: nativo via `cache_control: {type:"ephemeral"}` en el bloque system.
- OpenRouter: automatico para Claude/Gemini/DeepSeek. Kimi K2.6 no soporta caching.

**Nota sobre Kimi K2.6 (comportamiento real verificado en Slice 4):**
- Via OpenRouter, Kimi K2.6 vuelca su razonamiento completo en el campo `content` — no usa un
  campo `reasoning` separado. Esto hace que tareas de generacion de texto libre (como borradores)
  devuelvan el chain-of-thought completo en vez del mensaje final.
- **Kimi K2.6 NO es apto como override de modelo para borradores** (`task_type: "draft"`).
- Si el prompt exige una respuesta estructurada (clasificacion JSON, etc.) puede funcionar si
  el formato fuerza la salida. Verificar caso a caso.
- El guard `if (!content.trim())` en `draft.ts` NO detecta este problema porque `content`
  no viene vacio — viene con el razonamiento. Limitacion documentada, sin workaround en Slice 4.
- Para borradores: usar siempre Sonnet 4.6 (default). El override de modelo queda disponible
  pero es responsabilidad del operador verificar compatibilidad.

**Turbopack + Windows:** `@anthropic-ai/sdk` y `openai` usan imports `node:*` que generan
nombres de archivo invalidos en Windows. Fix: `serverExternalPackages` en `next.config.ts`.

**Fix exFAT (Windows local):** `scripts/fix-exfat.cjs` parchea `fs.readlink` y `fs.realpath`
para convertir EISDIR → EINVAL. Se carga via `node-options=--require ./scripts/fix-exfat.cjs`
en `.npmrc`. El script tiene guard `if (process.platform !== 'win32') return;` — es no-op en
Linux (Vercel) y macOS.

---

## 4. Arquitectura — los dos flujos

### Flujo entrante (diario — el dolor principal a eliminar)
1. Un lead responde en LinkedIn → Dylan lo ve en LH2.
2. Dylan abre el cockpit, selecciona o crea el lead, pega la ultima respuesta del lead.
3. La app hace upsert del lead y anexa el mensaje (`messages`, direction = inbound)
   usando `src/lib/leads/ingest.ts` (libreria compartida con el flujo batch).
4. La app genera **automaticamente** un borrador de respuesta (router -> Sonnet) usando:
   reglas de voz + perfil del lead + hilo completo. Se guarda en `drafts` (status = pending).
5. Dylan ve el borrador junto al perfil, lo edita si hace falta, lo copia,
   lo envia **a mano en LinkedIn**, y marca "enviado"
   (se anexa como `messages`, direction = outbound).

Nota: el webhook de LH2 (`/api/lh-webhook`) fue eliminado en la reestructuracion pre-Slice 4.
La ingesta es manual via el cockpit. El parser LH2 (`src/lib/lh/parser.ts`) y la libreria
`src/lib/leads/ingest.ts` siguen siendo la logica central — reutilizables para la ingesta
manual y el flujo batch (CSV).

### Flujo batch (outreach — periodico)
1. Dylan sube el CSV scrapeado de LH2.
2. Clasificacion por lead (router -> Haiku): `cs_group` (A / B / NO_ESCRIBIR), `cs_city`,
   `cs_country`. Logica canonica en `/prompts/clasificacion.md`.
3. Para cada geografia, asegurar dato de mercado cacheado en `market_data` (estadistica
   verificable + problema comun). Se genera una vez por pais/ciudad y se reutiliza.
   Logica en `/prompts/mercado.md`.
4. Generacion **por lead** de los 3 mensajes (cold / fu1 / fu2) en **una sola llamada**,
   inyectando el `market_data` como contexto y escalando la profundidad segun A/B.
   Se guardan en `outreach_sequence`.
5. Export de CSV enriquecido (columnas `cs_msg_cold`, `cs_msg_fu1`, `cs_msg_fu2`, etc.)
   listo para importar a una campana de LH2.

---

## 5. Modelo de datos

Esquema completo en `supabase/migrations/001_sales_cockpit_schema.sql`. Tablas:
- `leads` — entidad central (identidad, perfil scrapeado, clasificacion, estado,
  `raw_profile` jsonb con el payload completo de LH2).
- `messages` — hilo de conversacion (inbound / outbound). Un trigger mantiene los
  `last_*_at` del lead.
- `drafts` — borradores de respuesta generados por IA.
- `outreach_sequence` — los 3 mensajes por lead (cold / fu1 / fu2).
- `market_data` — dato de mercado cacheado por pais/ciudad (contexto inyectado, no output).
- `followups` — recordatorios de cadencia (3d / 5d / manual).
- `batches` — cada importacion de CSV.
- `ai_usage` — libro de gasto de IA por llamada / modelo / tarea.
- Vistas: `leads_awaiting_reply` (bandeja del cockpit), `followups_due`, `ai_spend_monthly`.

Single-user: RLS no es necesario por ahora (queda comentado en la migracion).

---

## 6. Voz y reglas de mensajes (ITMANO)

Todos los mensajes generados (outreach y respuestas) en **espanol neutro latino**. Reglas:
- Observacion real del negocio del lead — nada generico.
- Insight util que demuestre expertise sin revelar toda la solucion.
- Terminar con una pregunta diagnostica que avance hacia el dolor real.
- Invitar a demo solo cuando hay dolor especifico + interes confirmados.
- **Calibrar la longitud a la apertura del lead:** si responde corto/cortante, el mensaje
  es corto (max 3-4 lineas); solo extenderse si el lead muestra apertura real.
- Tono humano, calido, no de ventas, no automatizado.
- Nunca "costo", "precio", "pago" ni "cargo" -> siempre "inversion".
- Outreach: personalizacion por lead escalada por A/B (A = profunda; B = angulo de mercado
  + toque ligero). FU1 cambia el angulo por completo; FU2 = cierre empatico con puerta
  abierta.

Los prompts canonicos (clasificacion, mercado, analisis/respuesta de lead) viven en
`/prompts/` y son la fuente de verdad de la logica. Portan los .md que Dylan ya usa
(prompt_clasificacion_leads, prompt_parrafos_mercado, AnalsisLeads). No reinventar la
logica: adaptarla.

---

## 7. Integracion Linked Helper 2 (LH2)

- Plan: Standard.
- El webhook de LH2 fue eliminado. La ingesta de respuestas es manual (pegado en el cockpit).
- Import/export por CSV para el flujo batch (Slice 6).
- El parser (`src/lib/lh/parser.ts`) sigue siendo la fuente de verdad para el mapeo de
  campos LH2 → tabla `leads`. Se reutiliza para el import CSV.
- Formato del payload de LH2 documentado en la seccion 10 (captura real de Slice 3).

---

## 8. Convenciones de codigo

- TypeScript estricto. Identificadores en ingles.
- Acceso a DB centralizado (no SQL disperso); tipos derivados del esquema.
- Toda llamada de IA pasa por el router y se registra en `ai_usage`.
- Strings visibles al usuario en espanol neutro latino.
- Manejo de errores explicito en las llamadas de IA y en todos los endpoints.
- Secretos en variables de entorno; nunca en el repo.
- **UI responsiva:** todas las pantallas del cockpit deben funcionar bien en viewport movil
  (375px+) y escritorio. Usar Tailwind con breakpoints `sm:` / `md:` / `lg:`.
- **Sin acceso a DB client-side:** todo acceso a datos pasa por Server Actions o API routes
  protegidos por el middleware de auth.

---

## 9. Comandos

- `pnpm dev` — correr local (puerto 4010, Turbopack)
- `pnpm start` — servir build en puerto 4010 (build lo hace Vercel; no se corre localmente)

**Migraciones Supabase — mecanismo canonico: MCP `apply_migration`.**
- Todas las migraciones se aplican via MCP de Supabase (`apply_migration`).
- Antes de cualquier cambio de esquema, usar `list_tables` para verificar el estado actual.
- No usar `supabase db push` (requiere auth del CLI que no esta configurada).
- El historial de migraciones queda registrado automaticamente en Supabase al usar `apply_migration`.

---

## 10. Estado actual del proyecto

**Slice 1 completado (2026-06-16).** Fundaciones listas:
- Next.js 15 (App Router + TS + Tailwind v4) en puerto 4010
- Clientes Supabase (server) y tipos TypeScript derivados del esquema
- Migracion 001 aplicada: 8 tablas + 3 vistas en Supabase cloud
- Healthcheck `/api/health` retorna `{"ok": true}` con supabase + ai_router OK

**Slice 2 completado (2026-06-17).** Capa de IA lista:
- Router multi-proveedor: Anthropic directo + OpenRouter (`lib/ai/router.ts`)
- Catalogo de 5 modelos con precios, caching y web search (`lib/ai/models.ts`)
- Dos providers implementados: `AnthropicProvider` y `OpenRouterProvider` (`lib/ai/provider.ts`)
- System prompt base ITMANO en espanol neutro latino (`lib/ai/voice.ts`)
- Logging de todas las llamadas en `ai_usage`; vista `ai_spend_monthly` verificada
- Playground de pruebas en `/dev/playground` (solo modo desarrollo; protegido por auth + NODE_ENV)
- Tests manuales verificados: Sonnet 4.6 OK, Kimi K2.6 OK, web search Claude OK ($0.01/busq), web search OpenRouter OK ($0.005/req)
- Fix Turbopack/Windows: `serverExternalPackages` en `next.config.ts`

**Slice 3 completado (2026-06-17).** Ingesta webhook LH2 lista (captura del payload real):
- Captura payload real de LH2 → documentado en tabla de mapeo de esta seccion
- Parser `src/lib/lh/parser.ts` → mapeo LH2 → tabla `leads` + extraccion de mensajes
- Verificado con lead real: Miguel Mozos (lh_id=1160), 2 mensajes, `leads_awaiting_reply` OK
- El webhook `/api/lh-webhook` fue **eliminado** en la reestructuracion pre-Slice 4

**Reestructuracion pre-Slice 4 completada (2026-06-17).**
- Despliegue cambiado de local-first a Vercel
- Auth single-user implementada: middleware Edge, cookie HMAC con expiracion, timingSafeEqual,
  rate-limit + delay en fallos, sesion de 7 dias
  - `src/lib/auth/session.ts` — Web Crypto (edge-safe)
  - `src/middleware.ts` — protege todas las rutas; excluye `/login` y `/api/auth/*`
  - `src/app/login/page.tsx` — formulario de login
  - `src/app/api/auth/login/route.ts` — endpoint de login
  - `src/app/api/auth/logout/route.ts` — endpoint de logout
- Libreria compartida de ingesta: `src/lib/leads/ingest.ts`
  (upsertLead, insertMessages, computeLeadStatus, PROTECTED_STATUSES)
- Eliminado: `/api/lh-webhook`, cliente browser Supabase (`src/lib/supabase/client.ts`)
- `NEXT_PUBLIC_SUPABASE_URL` renombrado a `SUPABASE_URL` (privado)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `LH_WEBHOOK_SECRET` eliminados de `.env.local`
- `scripts/fix-exfat.cjs` ahora tiene guard de plataforma (`platform !== 'win32'`) — no-op en Vercel

**Shape real del payload de LH2 (`CheckForReplies`) — capturado en Slice 3:**
- ~270 campos por perfil; numerados (organization_1..10, education_1..3, etc.)
- Campos clave: `lh_id` (id interno de LH), `replied_message_1_text` (inbound, el disparador),
  `last_received_message_text` (outbound de Dylan = lo recibido por el lead), `cs_city`, `cs_country`
  (custom fields de Dylan en LH2, llegan ya rellenados), `cs_parrafo_mercado` (contexto para prompts → raw_profile)
- Terminologia LH2: `last_sent` = enviado por el lead (inbound); `last_received` = recibido por el lead (outbound de Dylan)
- Todos los campos numericos vienen como string (`followers`, `badges_premium`); convertir al parsear
- Metadatos de campana: `campaign_name`, `campaign_id`, `action_type` ("CheckForReplies"), `my_full_name`

**Mapeo LH2 → tabla `leads`:**
| Campo LH2 | Columna leads | Nota |
|---|---|---|
| `lh_id` | `lh_id` | Clave de upsert |
| `full_name` | `full_name` | Display name limpio |
| `first_name`/`last_name` | idem | |
| `headline` | `headline` | |
| `summary` | `summary` | |
| `current_company` | `current_company` | |
| `current_company_position` | `current_position` | Nombre difiere |
| `location_name` | `location_name` | |
| `followers` (string) | `followers` | parseInt() |
| `website_1` | `website` | |
| `badges_premium` ("true"/"false") | `has_premium` | === "true" |
| `cs_city` / `cs_country` | idem | Ya clasificados en LH2 |
| body completo | `raw_profile` | jsonb (incluye email, avatar, campaign_name, cs_parrafo_mercado, etc.) |

**Slice 4 completado (2026-06-17).** Borrador on-demand + endpoint de ingesta manual:
- Servicio `src/lib/ai/draft.ts`:
  - Lee `prompts/respuesta-lead.md` lazy (primera llamada) y cachea en memoria.
  - System prompt = `ITMANO_BASE_SYSTEM_PROMPT` + `respuesta-lead.md` (cache_control ephemeral).
  - User message: perfil completo (summary hasta 1500 chars) + `cs_parrafo_mercado` de
    `raw_profile` + hilo cronologico de `messages`.
  - maxTokens = 2048 uniforme (deja margen para razonamiento de Kimi/modelos thinking).
  - Guarda en `drafts` (status='pending', trigger='manual') y registra en `ai_usage`.
  - Guard: si `content` vacio → error claro (no enviar reasoning como borrador).
- Endpoint `POST /api/leads/[id]/messages` (detras de auth):
  - Body: `{ direction, body, sent_at?, model?, web_search? }`
  - `inbound` → inserta mensaje (source='manual_paste') + genera borrador → devuelve ambos.
  - `outbound` → solo inserta mensaje, sin borrador.
  - Si el borrador falla tras insertar el mensaje → 200 con `draft: null, draft_error: ...`.
- Campos inyectados al prompt: `full_name`, `headline`, `current_position`, `current_company`,
  `location_name`, `summary` (≤1500 chars), `website`, `cs_group`, `cs_parrafo_mercado`
  (de `raw_profile`), hilo completo de `messages` ordenado por `sent_at ASC`.
- Web search: off por default en borradores. Flag disponible como override.
- Verificado con lead real Miguel Mozos:
  - Sonnet 4.6 ✅ — neutro latino correcto, calibrado a apertura del lead.
  - Kimi K2.6 ⚠️ — vuelca razonamiento en content; NO apto para borradores (ver nota Kimi).
- Fix dotenv: `APP_PASSWORD` con `$` o `#` en `.env.local` requiere escape `\$` (dotenv-expand
  expande `$VAR`; single quotes no previenen esto). En Vercel, el valor se almacena sin parsing.

**Slice 5a completado (2026-06-18).** Cockpit core — bucle de trabajo diario:
- shadcn/ui inicializado (New York + zinc + CSS vars): button, textarea, input, label, badge,
  card, separator, skeleton, tabs, scroll-area + sonner (toasts).
- `src/lib/utils.ts` (`cn()`), `src/app/globals.css` (CSS vars + @theme inline para Tailwind v4).
- **Bandeja (`/`):** Server Component. Lista todos los leads activos (excluye perdido/descartado)
  ordenados por last_activity_at. Tabs [Todos | Por responder]. Badge "Por responder" + fragmento
  del ultimo mensaje inbound para leads en `leads_awaiting_reply`. Click → ficha.
- **Ficha (`/leads/[id]`):** Server Component + client islands.
  - Columna izq (sticky en md+): `LeadProfile` — nombre, headline, cargo, empresa, ubicacion,
    grupo, web, summary (max 600 chars).
  - Columna der: `FichaClient` (client) — `MessageThread` + `PasteBox` + `DraftPanel`.
  - `PasteBox`: pega mensaje inbound → `POST /api/leads/[id]/messages` → genera borrador Sonnet 4.6
    con spinner (Skeleton) mientras genera.
  - `DraftPanel`: textarea editable + boton copiar (clipboard API + toast) + boton marcar enviado
    → `POST /api/leads/[id]/send` → toast de confirmacion + redirect a bandeja.
- **Alta manual (`/leads/new`):** formulario (nombre*, cargo, empresa, ciudad, pais, headline,
  summary) → `POST /api/leads` → redirige a `/leads/[id]`.
- **Nuevos endpoints:**
  - `POST /api/leads` — crea lead con `lh_id = manual_<uuid>`; tipo `LeadInsert` completo.
  - `POST /api/leads/[id]/send` — inserta outbound via `insertMessage()` compartido
    (mismo que `messages/route.ts`) + marca draft `sent`. `last_outbound_at` lo actualiza
    el trigger de DB; no se duplica logica.
- `src/lib/leads/messages.ts` — `insertMessage()`: funcion compartida para insertar mensajes;
  la usan `/messages/route.ts` (direction outbound) y `/send/route.ts`.
- Responsive: mobile-first, layout 2 columnas en md+, apilado vertical en mobile.
- TypeScript limpio + lint clean; deploy Vercel exitoso (verificado via GitHub statuses).

**Proximo paso: Slice 5b (dropdown de modelo + toggle web search; follow-ups vencidos).**
**Repositorio remoto:** https://github.com/ConveningMoon/sales_cockpit.git

---

## 11. Roadmap por slices

1. **Fundaciones:** scaffold Next.js (App Router + TS + Tailwind v4 + shadcn/ui), conectar
   Supabase + aplicar migracion 001, variables de entorno, healthcheck. **COMPLETADO.**
2. **Capa de IA:** multi-proveedor (Anthropic + OpenRouter), 5 modelos, web search, caching,
   playground, logging en `ai_usage`. **COMPLETADO.**
3. **Ingesta LH2:** parser campos LH2 → leads, captura payload real, verificacion con lead
   real. **COMPLETADO.** (El webhook fue reemplazado por ingesta manual en la reestructuracion.)
4. **Auto-borrador + ingesta manual:** endpoint `POST /api/leads/[id]/messages`, servicio
   `lib/ai/draft.ts`, prompt `prompts/respuesta-lead.md`. Verificado con lead real. **COMPLETADO.**
5. **Cockpit:**
   - **5a:** bandeja (todos + por responder), ficha (perfil + hilo + paste + borrador + marcar
     enviado), alta manual. Layout responsive 2-col. **COMPLETADO.**
   - **5b (pendiente):** dropdown de modelo + toggle web search por generacion de borrador;
     vista follow-ups vencidos.
6. **Pipeline batch:** subir CSV -> clasificar -> cachear market_data -> generar 3 mensajes
   por lead -> exportar CSV.

---

## 12. Por verificar / preguntas abiertas

- ~~Autenticacion del Agent SDK~~ **RESUELTO (Slice 2):** API key directa.
- ~~LH2 → localhost~~ **RESUELTO (Slice 3):** funcionaba con Axios/0.27.2. Ya no aplica
  (webhook eliminado; ingesta es manual).
- ~~Forma exacta del payload del webhook de LH2~~ **RESUELTO (Slice 3):** documentado en
  seccion 10.
- ~~Flujo de migraciones~~ **RESUELTO:** MCP `apply_migration` + `list_tables`.
- ~~Auth mecanismo~~ **RESUELTO (reestructuracion pre-Slice 4):** password + cookie HMAC.
- ~~Despliegue local vs. Vercel~~ **RESUELTO:** Vercel. `pnpm dev` para desarrollo local.
- ~~exFAT fix en Vercel~~ **RESUELTO:** guard de plataforma en `fix-exfat.cjs`; no-op en Linux.
- ~~Contrasena inicial~~ **RESUELTO:** password fuerte seteado. Fix dotenv: `\$` para escapar
  `$` en `.env.local` (dotenv-expand lo expande sin escape).
- ~~Diseno de la pantalla del cockpit para Slice 4~~ **RESUELTO:** flujo via endpoint API
  (`POST /api/leads/[id]/messages`); UI implementada en Slice 5a.
- ~~Cockpit UI~~ **RESUELTO (Slice 5a):** bandeja, ficha, borrador, alta manual implementados.
  Pendiente para 5b: selector de modelo + toggle web search + follow-ups vencidos.
- **shadcn + Tailwind v4:** `pnpm dlx shadcn@latest init -y` es interactivo (no acepta flags
  `--style`/`--base-color`). Solucion: crear `components.json` manualmente, instalar deps
  (`class-variance-authority clsx tailwind-merge lucide-react`) y luego `shadcn add <componente>`.
  El bloque `@theme inline` en `globals.css` es necesario para que Tailwind v4 reconozca
  `bg-primary`, `text-foreground`, etc. como utility classes (mapea CSS vars → color tokens).
- **Kimi K2.6 en borradores:** vuelca reasoning en `content` via OpenRouter. Causa que el
  borrador sea el chain-of-thought completo, no el mensaje. No usar Kimi como override para
  `task_type: "draft"`. Documentado en seccion 3.
- ~~Prompts en Vercel~~ **RESUELTO:** `outputFileTracingIncludes: { "/api/**": ["./prompts/**"] }`
  en `next.config.ts` (nivel raiz, tipado en `NextConfig`). Incluye `./prompts/**` en el bundle
  serverless. Flujo verificado: editar `.md` + push + redeploy = prompt actualizado en produccion.
  Cache en memoria (`_draftSystemPrompt`) se limpia en cada cold-start (Vercel destruye instancias
  al redeploy). El placeholder `[ENLACE_DEL_RECURSO]` pasa sin transformacion al borrador.
