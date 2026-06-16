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

- Next.js (App Router) + React + TypeScript
- Tailwind v4 + shadcn/ui
- Supabase (PostgreSQL) como base de datos
- Claude Agent SDK para la inferencia (ver seccion 3)
- Resend (opcional, notificaciones)

---

## 3. Despliegue e IA

**Despliegue: local-first (por ahora).** La app corre localmente en la PC de Dylan cuando
trabaja. Razon: las campanas de LH2 solo corren cuando Dylan enciende su PC y las arranca
manualmente, asi que el webhook solo necesita estar disponible en ese momento. No hay
despliegue 24/7 en la nube por ahora. Supabase (cloud) es la DB; la app local se conecta a
ella normalmente. LH2 corre en la misma PC, asi que puede hacer POST a
`http://localhost:<PORT>/api/lh-webhook`.

**Inferencia: solo Claude Agent SDK (por ahora),** autenticado con la suscripcion Pro de
Dylan para consumir el credito mensual de Agent SDK (~$20 en Pro). Como la app no es 24/7 y
Dylan esta autenticado en su maquina, este camino encaja. Upgrade path futuro: API key
(prepago) + deploy 24/7; gracias al router (abajo) es un cambio de configuracion.

**Router de modelos (abstraccion obligatoria).** Toda llamada de IA pasa por un modulo
router (`lib/ai/`) que recibe un `task_type` y elige proveedor + modelo. Por ahora:
proveedor unico = Agent SDK (Claude). Ruteo por tarea:
- Clasificacion / extraccion -> modelo barato (Haiku).
- Generacion de mensajes y borradores (donde vive la voz) -> Sonnet.

El router debe permitir cambiar a API key o a un proveedor de terceros en el futuro solo
con configuracion. Cada llamada se registra en `ai_usage`.

**A verificar (mecanismo nuevo, 15-jun-2026):** la autenticacion del Agent SDK con la
suscripcion y la mecanica del credito mensual son recientes. Verifica contra la
documentacion vigente del Agent SDK en el Slice 2 antes de cablear. No asumas la API.

---

## 4. Arquitectura — los dos flujos

### Flujo entrante (diario — el dolor principal a eliminar)
1. Un lead responde en una campana de LH2 -> el plugin "Send replied to Webhook" hace POST
   a `/api/lh-webhook` con perfil + texto de la respuesta.
2. La app valida el secreto, hace upsert del lead y anexa el mensaje
   (`messages`, direction = inbound).
3. La app genera **automaticamente** un borrador de respuesta (router -> Sonnet) usando:
   reglas de voz + perfil del lead + hilo completo. Se guarda en `drafts` (status = pending).
4. En el cockpit, Dylan ve el borrador junto al perfil, lo edita si hace falta, lo copia,
   lo envia **a mano en LinkedIn**, y marca "enviado"
   (se anexa como `messages`, direction = outbound).

Turnos siguientes: como Dylan responde dentro de LinkedIn, hay una caja para pegar la
ultima linea del lead -> genera borrador (la app ya tiene perfil + historial).
Opcional/avanzado: una campana de monitoreo en LH2 re-dispara el webhook en cada respuesta.

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

Esquema completo en `supabase/migrations/001_sales_cockpit_schema.sql`. El SQL está en la raíz, reubícalo en supabase/migrations/ durante el scaffold. Tablas:
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

- Plan: Standard. Webhooks limitados a 20 perfiles/dia (suficiente; el excedente se maneja
  a mano).
- "Send replied to Webhook" -> POST a `/api/lh-webhook`.
- **Captura el payload real primero.** Antes de escribir el parser, usa "Run once" en LH2 y
  registra el JSON exacto que envia (tiene campos de numero variable). No asumas la forma.
- Endpoint protegido con un secreto (query param o header).
- Import/export por CSV para el flujo batch.

---

## 8. Convenciones de codigo

- TypeScript estricto. Identificadores en ingles.
- Acceso a DB centralizado (no SQL disperso); tipos derivados del esquema.
- Toda llamada de IA pasa por el router y se registra en `ai_usage`.
- Strings visibles al usuario en espanol neutro latino.
- Manejo de errores explicito en el webhook y en las llamadas de IA.
- Secretos en variables de entorno; nunca en el repo.

---

## 9. Comandos (completar al armar el scaffold)

- `npm dev` — correr local
- `npm build` / `npm start`
- Migraciones Supabase: definir flujo en el Slice 1

---

## 10. Estado actual del proyecto

**Greenfield.** Disenado: el esquema (migracion 001) y esta arquitectura. Construido: nada
todavia. Proximo paso: Slice 1 (Fundaciones).
**Repositorio nuevo donde ira el proyecto:** https://github.com/ConveningMoon/sales_cockpit.git 

---

## 11. Roadmap por slices

1. **Fundaciones:** scaffold Next.js (App Router + TS + Tailwind v4 + shadcn/ui), conectar
   Supabase + aplicar migracion 001, variables de entorno, auth/proteccion local, cablear y
   verificar el Agent SDK, healthcheck.
2. **Capa de IA:** modulo router (Agent SDK; Haiku clasifica / Sonnet genera), system
   prompts con voz neutro latino + reglas ITMANO, logging en `ai_usage`.
3. **Ingesta webhook:** `/api/lh-webhook` con secreto; capturar el payload real de LH2
   primero; upsert lead + anexar mensaje.
4. **Auto-borrador:** al ingerir un inbound, generar y guardar el borrador.
5. **Cockpit:** bandeja (`leads_awaiting_reply`) con borrador + perfil + editar + copiar +
   marcar enviado; caja de pegado para turnos siguientes; follow-ups vencidos.
6. **Pipeline batch:** subir CSV -> clasificar -> cachear market_data -> generar 3 mensajes
   por lead -> exportar CSV.

---

## 12. Por verificar / preguntas abiertas

- Autenticacion del Agent SDK con la suscripcion y mecanica del credito mensual (mecanismo
  nuevo del 15-jun-2026): verificar contra docs vigentes antes del Slice 2.
- Que LH2 pueda hacer POST a `http://localhost:<PORT>` desde la misma PC (probar en Slice 3).
- Forma exacta del payload del webhook de LH2 (capturar con "Run once").
- Flujo de migraciones de Supabase preferido (CLI vs panel): confirmar con Dylan en Slice 1.
