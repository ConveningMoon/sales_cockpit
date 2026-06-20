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
  - **Bug fix (Slice 5a-fix):** el `if` de sincronizacion estaba en el cuerpo del render,
    sobreescribiendo cada edicion del usuario. Movido a `useEffect([draft])` — resetea solo
    cuando llega un draft nuevo del servidor.
- **MessageThread (desde Slice 5a-fix):** Client Component con edicion inline por mensaje.
  Boton "Editar" → textarea + Guardar/Cancelar. Llama `PATCH /api/leads/[id]/messages/[messageId]`.
  Solo actualiza `body` — no regenera borrador. El callback `onMessageUpdated` actualiza el
  estado en `FichaClient` sin reload de pagina.
- **Alta manual (`/leads/new`):** formulario (nombre*, cargo, empresa, ciudad, pais, headline,
  summary) → `POST /api/leads` → redirige a `/leads/[id]`.
- **Endpoints:**
  - `POST /api/leads` — crea lead con `lh_id = manual_<uuid>`; tipo `LeadInsert` completo.
  - `POST /api/leads/[id]/send` — inserta outbound via `insertMessage()` compartido
    (mismo que `messages/route.ts`) + marca draft `sent`. `last_outbound_at` lo actualiza
    el trigger de DB; no se duplica logica.
  - `PATCH /api/leads/[id]/messages/[messageId]` — actualiza solo `body`; protegido por auth;
    no regenera borrador.
- `src/lib/leads/messages.ts` — `insertMessage()`: funcion compartida para insertar mensajes;
  la usan `/messages/route.ts` (direction outbound) y `/send/route.ts`.
- Responsive: mobile-first, layout 2 columnas en md+, apilado vertical en mobile.
- TypeScript limpio + lint clean; deploy Vercel exitoso (verificado via GitHub statuses).

**Slice 5c completado (2026-06-19).** Importacion CSV de LH2 + link de LinkedIn:
- `parseLh2LeadRow()` extraida de `parseLh2Payload` — solo perfil, sin mensajes.
  Permite parsear filas de CSV sin requerir `replied_message_1_text`.
- `upsertLead()` acepta `newLeadStatus` opcional (default `"respondio"` para inbound;
  pasar `"nuevo"` para importacion de prospectos sin contacto previo).
- `profile_url` visible en ficha: `LeadProfile` muestra "Ver perfil ↗" (target=_blank).
  `leads/[id]/page.tsx` ya seleccionaba la columna; ahora la pasa como prop.
- Alta manual (`/leads/new`): campo "URL del perfil de LinkedIn" (opcional).
  `POST /api/leads` guarda `profile_url` del body.
- `POST /api/leads/import`:
  - Body: `{ rows: Record<string, string>[] }`, maximo 500 filas.
  - Por fila: `parseLh2LeadRow` → `upsertLead(supabase, leadData, "nuevo")`.
  - Retorna `{ created, updated, leadIds, errors }` con detalle por fila.
- `CsvUploader` (client): FileReader + PapaParse, muestra cuenta de filas, llama
  `/api/leads/import`, redirect a ficha si 1 lead, a bandeja si varios.
- `/leads/new`: tabs [Subir CSV de LH2 | Alta manual] via `NewLeadTabs` (client).
- `papaparse` + `@types/papaparse` agregados a las dependencias.
- TypeScript limpio + lint clean; 3 commits separados.

**Slice 5d completado (2026-06-19).** Importador de conversacion + alta manual de mensaje:
- Migracion 002: `ai_usage.task_type` ampliado para incluir `"parse_conversation"`.
  `AiTaskType` en `database.ts` y `DEFAULT_MODELS` en `models.ts` actualizados.
- `src/lib/ai/conversation-parser.ts` (ver 5d-fix abajo para estado final):
  - `assignTimestamps()`: el orden del array es la fuente de verdad; candidato=timestamp
    parseado si confiable, si no prev+1min; sent_at=max(candidate, prev+1s) — monotonia
    estricta sin anclar a now() independientemente.
  - `normalizeBody()`: trim+collapse whitespace+lowercase para dedup app-level.
- `POST /api/leads/[id]/import-conversation`: dedup en memoria, timestamps monotonos,
  UN solo borrador al final (si ultimo del array es inbound), lead_status actualizado.
- `POST /api/leads/[id]/messages`: flag `no_draft:true` para omitir borrador (mensajes historicos).
- `AddManualMessage` (client): form inline para mensaje suelto (direction, body, fecha opcional).
  Sin borrador. Tras insertar, re-ordena el hilo local por sent_at.
- `FichaClient`: integra ambos; tras import hace `router.refresh()` para el hilo historico.
- `page.tsx`: selecciona `raw_profile` para pre-rellenar `my_full_name` en ImportConversation.
- Campo "Tu nombre en LinkedIn": siempre visible, pre-rellenado desde
  `raw_profile.my_full_name` si existe, editable, requerido — nunca falla si el campo no vino.

**Slice 5d-fix completado (2026-06-19).** Parser determinista (sin IA) + preview editable:
- **Razon del fix:** Haiku truncaba el JSON porque reproducia el texto completo de la
  conversacion en la respuesta, agotando el presupuesto de tokens.
- `src/lib/ai/conversation-parser.ts` reescrito como funcion pura sin llamadas a IA:
  - `parseConversationText(text, myName, leadName)`: parser linea a linea, cliente-safe.
    Orden de evaluacion: ruido → cabecera de fecha → ancla → cuerpo.
  - **Ancla**: linea que matchea `<nombre>  <hora AM/PM>` (2+ espacios, AM/PM obligatorio
    al final de linea). Si el nombre normalizado == myName → outbound; cualquier otro nombre
    valido → inbound. No se depende de matchear el nombre exacto del lead (evita fallos por
    diferencias de acento o espaciado entre LH2 y LinkedIn).
  - **Ruido ignorado**: `sent the following message(s) at`, `View X's profile...` (apóstrofo
    curvo y recto), `Seen by X at`.
  - **Cabeceras de fecha** (actualizan `currentDate`, no producen mensaje):
    nombres de dia, `Today`/`Yesterday`, `Apr 22`/`May 5` etc.
  - **timestamp_raw**: string combinado `"May 13 2:08 PM"`, `"Monday 6:24 PM"`, `"Today 8:43 AM"`.
  - `assignTimestamps()` y `normalizeBody()` permanecen para uso server-side.
  - `tryParseTimestamp()` actualizado: year dinamico (resta 1 anio si la fecha queda en el
    futuro), maneja "Apr 22 1:40 PM", "Monday 6:24 PM", "Today 8:43 AM", "Yesterday 5 PM".
- `POST /api/leads/[id]/parse-conversation` eliminado (ya no se usa; el parseo es cliente-side).
- Migracion 002 (`parse_conversation` en ai_usage) permanece — no vale la pena revertirla.
- `ImportConversation` (client): parseo instantaneo sin round-trip al servidor.
  Paso 1 (textarea+my_name) → preview instantaneo → confirmar → import.
  Preview: chip de direccion (toggle) + edicion inline del cuerpo (boton ✎ → textarea
  Guardar/Cancelar) + eliminar fila (✕). Util para limpiar firmas duplicadas de LinkedIn.
  Importar bloqueado si hay una edicion abierta sin guardar.
- El cliente emite `timestamp_raw` (string); el servidor (`import-conversation`) lo resuelve
  a `sent_at` con su propio `now()` — servidor como unica fuente de verdad para la DB.
- Fix de deteccion de direccion (2026-06-19): la regla de anchor cambio a "mi nombre →
  outbound; cualquier otro ancla valida → inbound". Elimina dependencia del nombre exacto
  del lead. Campo "Nombre del lead" en la UI es solo visual (no afecta el parseo).

**Slice 5e completado (2026-06-19).** Rediseno dark premium — puramente visual, funcionalidad intacta:
- **Paleta dark en `:root`** (siempre oscuro, sin toggle): `--background: 238 16% 7%`,
  `--card: 238 13% 11%`, `--primary: 248 82% 67%` (indigo-violeta), `--border: 238 15% 22%`,
  `--gradient-brand: linear-gradient(135deg, hsl(235 85% 65%), hsl(268 78% 65%))`.
  Scrollbar sutil via `scrollbar-*`. `--radius: 0.625rem` uniforme.
- **Tipografia:** Inter via `next/font/google` con variable `--font-inter`. Labels de seccion
  11px uppercase tracking-[0.08em]. Nombre de lead 1.25rem semibold.
- **`@custom-variant dark`** para compatibilidad con shadcn/ui (clase `dark` en `<html>`).
- **`src/lib/ui-helpers.ts`**: `statusBadgeClass()`, `groupBadgeClass()`, `statusLabel()` —
  colores semanticos por estado (nuevo→zinc, respondio→indigo, cliente→emerald, perdido→rose...).
- **Bandeja** (`LeadCard`, `BandejaClient`): tarjetas con `rounded-xl` + sombra elevada,
  barra de acento gradiente izquierda para "por responder", badge gradient, jerarquia
  nombre > empresa/cargo > fragmento > ubicacion. Header con logo gradiente + CTA gradient.
  Tabs con count chips (badge gradient para "por responder").
- **Ficha** (`LeadProfile`, `MessageThread`, `PasteBox`, `DraftPanel`, `FichaClient`, `page.tsx`):
  badges semanticos en perfil, burbujas chat diferenciadas (primary/8 vs card), offset ml-8/mr-8,
  etiqueta "Tu"/"Lead" coloreada, fecha relativa (hora si es hoy). PasteBox con borde primary/25
  y glow sutil. DraftPanel con punto gradiente + boton "Marcar enviado" gradient. Header ficha
  con breadcrumb muted.
- **Formularios** (`AddManualMessage`, `ImportConversation`, `CsvUploader`, `NewLeadForm`):
  inputs con bg-background/50 y border-border/40, focus primario; CTAs con gradiente de marca;
  zona de drop CSV con tinte primary cuando cargado; chips de direccion con tinte gradient.
- 4 commits separados: `6ea7a6c` (global), `405725d` (bandeja), `c9d8039` (ficha), `47ec844` (formularios).
- TypeScript limpio + lint clean en todos los commits.

**Slice 5b-1 completado (2026-06-19).** Control manual de estado del lead:
- `PATCH /api/leads/[id]`: actualiza solo `lead_status`; valida contra los 9 estados
  canonicos; override directo, sin pasar por `computeLeadStatus`.
- `StatusSelector` (client island): badge semantico del estado actual + `<select>` nativo
  con `<optgroup>` "Pipeline" (nuevo..estrategia_agendada) y "Cierre" (cliente/perdido/descartado).
  Update optimista con revert en error; `router.refresh()` para reflejar en la bandeja.
- `LeadProfile`: recibe `leadId`; sustituye el badge estatico por `StatusSelector`.
- `ui-helpers.ts` ampliado: `en_conversacion` (violeta), `estrategia_agendada` (teal);
  eliminado `interesado` (no existe en el esquema DB).
- `computeLeadStatus` no se toca. `PROTECTED_STATUSES` ya cubre `demo_agendada` y
  `estrategia_agendada` → un inbound posterior no degrada el estado fijado manualmente.

**Slice 6 Push A completado (2026-06-20).** Pipeline batch — Fases 1-3:
- **Migracion 003** (`supabase/migrations/003_batch_pipeline.sql`):
  - `batches`: columnas `status` (enum 6 estados) y `error_message`.
  - `market_data`: columnas `price_sqm`, `sale_velocity`, `buyer_profile`, `demand_level`,
    `market_paragraph` (complementan las columnas legacy `stat`/`common_problem`).
- **`DEFAULT_MODELS.market_data`** cambiado de Haiku a Sonnet 4.6 (Haiku no soporta web search).
- **`src/types/database.ts`**: `BatchStatus` union type; `Batch` e `MarketData` actualizados.
- **`src/lib/ai/prompts.ts`** (nuevo): loader lazy + parser de `## SYSTEM` / `## USER` para
  `prompts/clasificacion.md` y `prompts/market-data.md`. `cleanJsonOutput()` (strips fences +
  trailing commas) compartido. Rutas leidas con `fs.readFileSync` en cold-start.
- **`src/lib/leads/ingest.ts`**: `upsertLead()` acepta `batchId?` como 4o parametro opcional;
  cuando se pasa, escribe `batch_id` en el lead. Callers anteriores sin cambio.
- **`POST /api/batches`**: crea batch (status='pending'), importa leads con `parseLh2LeadRow`
  + `upsertLead(..., "nuevo", batchId)`, actualiza `lead_count`. Retorna
  `{ batchId, leadCount, created, updated, errors }`. `maxDuration=60`.
- **`POST /api/batches/[id]/classify`**: clasifica hasta 20 leads por llamada (sin `cs_group`).
  Usa Haiku via `callAI({ taskType:"clasificacion" })`. Fallback a `NO_ESCRIBIR` en error
  de parseo (evita loop infinito). Avanza status a `fetching_market` cuando remaining=0.
  Retorna `{ classified, total, remaining, done, errors }`.
- **`POST /api/batches/[id]/market-data`**: una geografia por llamada. Valida cache con
  TTL de 30 dias (`expires_at > now()`). Llama Sonnet+webSearch via `callAI({ taskType:"market_data",
  webSearch:true, maxTokens:1024 })`. Parsea JSON de 6 campos; upsert en `market_data` con
  `onConflict: "country,city"`. Query null-safe: `.eq("city", val)` o `.is("city", null)` segun
  valor. Avanza status a `generating` cuando todas las geos tienen cache. Retorna
  `{ done, total, processed, cached, remaining, country, city }`.
- **UI batch** (nueva seccion de rutas `/batches/*`):
  - `/batches` — lista de batches con badge de status; link a `/batches/new`.
  - `/batches/new` — `BatchCsvUploader` (client): PapaParse en browser, campo nombre, zona
    de drop, POST a `/api/batches`, redirect a ficha del batch.
  - `/batches/[id]` — detalle: info del batch, desglose por grupo A/B/NO_ESCRIBIR/sin_clasificar,
    `BatchPipeline` (client island).
  - `BatchPipeline` (client): loop chunked para clasificar (muestra N/total), loop chunked para
    market-data (muestra geo actual y cache hits). Estados: pending → classifying →
    fetching_market → generating (mensaje "Push B pendiente") → done. Cada etapa tiene boton
    propio; "Retomar" si el status quedó en classifying sin running.
  - Bandeja: link "Batches" en el header junto a "+ Nuevo lead".
- **`safeFetch` helper (`src/lib/http/safeFetch.ts`):**
  - Lee la respuesta como texto, luego `JSON.parse` en try/catch.
  - Si no es JSON (ej. página de error 504 de Vercel/gateway), lanza con
    `"HTTP 504 Gateway Timeout — respuesta no-JSON: <cuerpo>"` — nunca "Unexpected token 'A'".
  - Para errores HTTP con body JSON válido (nuestros propios 500/409), devuelve `ok:false` con
    `data` parseado para acceder a `{error, stage, context}`.
  - Todos los loops del pipeline en `BatchPipeline` usan `safeFetch` en lugar de `res.json()`.
- **`ai_usage` como log de operaciones (migración 004):**
  - Nuevas columnas: `status text DEFAULT 'ok' CHECK (status IN ('ok','error'))`,
    `error_detail text`, `duration_ms integer`, `context jsonb`.
  - `callAI()` en `router.ts` loguea TODOS los intentos — exitosos (status='ok') y fallidos
    (status='error') — con `error_detail` (texto exacto del upstream), `duration_ms` y `context`.
  - En el path de error: `console.error("[AI] FALLO | ...")` con etapa, modelo y contexto;
    luego re-lanza el error para que el caller lo maneje.
  - `context` incluye `{ batch_id, country, city }` en market-data y `{ batch_id }` en classify.
  - Para diagnosticar un fallo: filtrar `ai_usage` por `status='error'` — el campo `error_detail`
    tiene el mensaje exacto del upstream de Anthropic o de web search.
- **Logs estructurados en runtime (Vercel):**
  - `[market-data] batch=<id> geo="<ciudad, país>" pending=N — llamando Sonnet+webSearch`
  - `[market-data] batch=<id> geo="..." — OK upsert en market_data, remaining=N`
  - `[market-data] batch=<id> geo="..." — ERROR: <mensaje completo>`
  - `[classify] batch=<id> — clasificando N leads`
  - `[AI] FALLO | <task_type> | <model> | <ms>ms` (+ error + context)
  - `[AI] OK | <task_type> | <model> | <ms>ms | in=N out=N searches=N cost=$N`
  - Leer logs de runtime via Vercel MCP: `mcp__vercel__getDeploymentEvents(deploymentId)`.
    Necesita el `projectId` o `slug` del proyecto Vercel.
- **Market data — arquitectura anti-timeout:**
  - El endpoint procesa UNA geografía por llamada. El cliente hace loop hasta `done: true`.
  - `web_search_20260209` con `max_uses: 4` (constante `WEB_SEARCH_MAX_USES` en el endpoint).
    Limita búsquedas por geografía → acota latencia < 60s y costo por request.
  - `webSearchMaxUses?: number` propagado en `AICallOptions` → `ProviderCallParams` → provider.
  - Pasada única de N queries para encontrar target + contar `remaining` (antes eran 2 pasadas × N).
  - En error: escribe `status="error"` + `error_message` verbatim en `batches` y devuelve
    `{ error, stage, context }`. Nunca traga el error en un mensaje genérico.
  - Progreso en la UI: "Buscando mercado: Madrid, España — 2/4" — sin "(caché)" ambiguo.
- **Principio de errores verbatim (app beta personal):**
  - Todos los endpoints del pipeline devuelven `{ error: <mensaje real>, stage: <etapa>, context: <detalle> }`.
  - Los errores fatales (market-data) escriben en `batches.error_message` y avanzan el status a `"error"`.
  - La UI (`BatchPipeline`) muestra el detalle exacto (localError inmediato + router.refresh() para el de DB).
  - Errores por lead en clasificación incluyen el nombre del lead y la causa exacta de Haiku.
  - Nunca "Error." genérico — siempre mensaje + etapa + contexto.
- **Parseo CSV de LH2 — contrato canonico:**
  - Delimitador: `;` (LH2 siempre exporta con punto y coma). PapaParse con `delimiter: ";"` explícito.
  - `skipEmptyLines: "greedy"` — descarta filas donde todos los campos son vacíos/espacios.
  - `filterLh2Rows()` en `src/lib/lh/parser.ts` — segunda línea de defensa: descarta filas donde
    `lh_id` es vacío. Función pura sin dependencias de servidor → usable en client y server.
  - Preview, conteo e import usan el mismo set filtrado: lo que se muestra == lo que se clasifica.
  - Bytes no-UTF8 en el campo `note` de LH2 son reemplazados por U+FFFD por el FileReader; no
    bloquean el parseo — solo se aborta si el set filtrado queda vacío.

**Proximo paso: Push B — generacion de secuencias via Batch API + export LH2 CSV.**
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
   - **5c:** importar CSV de LH2, link de LinkedIn en ficha, profile_url en alta manual.
     **COMPLETADO.**
   - **5d:** importador de conversacion + alta manual de mensaje anterior + flag no_draft.
     Parser determinista cliente-side (sin IA); preview editable. **COMPLETADO.**
   - **5e:** rediseno dark premium del cockpit (paleta, tipografia, tarjetas, badges semanticos,
     gradientes CTA). 4 commits. **COMPLETADO.**
   - **5b (pendiente):** dropdown de modelo + toggle web search por generacion de borrador;
     vista follow-ups vencidos.
6. **Pipeline batch:**
   - **Push A (Fases 1-3):** migracion 003, endpoints classify + market-data (chunked, cache
     30d), UI `/batches/*` con `BatchPipeline`. **COMPLETADO (2026-06-20).**
   - **Push B (Fase 4-5, pendiente):** generacion de secuencias via Batch API (Sonnet) +
     export CSV LH2 con columnas `lh_id, profile_url, full_name, cs_group, cs_city, cs_country,
     cs_msg_opener, cs_fu1, cs_fu2`. Requiere `prompts/outreach-sequence.md` de Dylan.

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
