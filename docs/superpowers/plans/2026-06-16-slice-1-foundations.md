# Slice 1 — Fundaciones: Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Proyecto Next.js funcionando localmente, conectado a Supabase con el esquema 001 aplicado, con un router de IA estructurado (stub), y un healthcheck que confirma que todo está conectado.

**Architecture:** App Router de Next.js como base. Supabase conectado con dos clientes (browser/anon y server/service_role). Router de IA en `src/lib/ai/router.ts` que abstrae el proveedor — stub en Slice 1, cableado real en Slice 2 tras verificar la auth del Agent SDK. Healthcheck en `/api/health` que valida DB + router.

**Tech Stack:** Next.js 15 (App Router) + TypeScript estricto + Tailwind v4 + shadcn/ui + Supabase JS client + @anthropic-ai/sdk (instalado pero stub en Slice 1)

---

> **NOTA: Preguntas pendientes de confirmar con Dylan antes de ejecutar**
> Ver diagnóstico completo en la sesión. Las decisiones críticas están marcadas con [PENDIENTE].

---

## Estructura de archivos

```
e:\ITMANO\Captacion\
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── health/
│   │   │       └── route.ts          # Healthcheck: DB + AI router
│   │   ├── layout.tsx
│   │   └── page.tsx                  # Placeholder "Cockpit" (solo header)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Cliente browser (anon key)
│   │   │   └── server.ts             # Cliente server (service_role)
│   │   └── ai/
│   │       ├── router.ts             # Router de modelos (STUB en Slice 1)
│   │       └── types.ts              # TaskType, AIRouterResult
│   └── types/
│       └── database.ts               # Tipos derivados del esquema SQL
├── supabase/
│   └── migrations/
│       └── 001_sales_cockpit_schema.sql   # [MOVER desde raíz]
├── .env.local                         # Ya existe con credenciales Supabase
├── .env.example                       # Template sin secretos (commit este)
└── CLAUDE.md
```

---

## Tarea 1: Scaffold de Next.js

**Archivos:**
- Crea: `package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Paso 1: Verificar directorio limpio**

```powershell
ls "e:\ITMANO\Captacion"
```

Esperado: solo `CLAUDE.md`, `prompt_inicial_claude_code.md`, `001_sales_cockpit_schema.sql`, `.env.local`, `docs/`

- [ ] **Paso 2: Crear el scaffold**

```powershell
cd "e:\ITMANO\Captacion"
npx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir --import-alias "@/*" --no-git
```

Cuando pregunte interactivamente:
- Would you like to use Turbopack? → **No** (estabilidad)
- (Aceptar el resto de defaults)

- [ ] **Paso 3: Instalar dependencias adicionales**

```powershell
cd "e:\ITMANO\Captacion"
pnpm add @supabase/supabase-js @anthropic-ai/sdk
pnpm add -D @types/node
```

- [ ] **Paso 4: Inicializar shadcn/ui**

```powershell
pnpm dlx shadcn@latest init
```

Cuando pregunte: elegir estilo `default`, color base `slate`, CSS variables → sí.

- [ ] **Paso 5: Verificar que el proyecto compila**

```powershell
pnpm build
```

Esperado: build exitoso sin errores.

- [ ] **Paso 6: Commit**

```powershell
git init
git add package.json tsconfig.json next.config.ts src/ public/ components.json tailwind.config.ts postcss.config.mjs .gitignore .eslintrc.json
git commit -m "feat: scaffold Next.js 15 con App Router, Tailwind v4 y shadcn/ui"
```

---

## Tarea 2: Variables de entorno

**Archivos:**
- Modifica: `.env.local` (agregar vars faltantes)
- Crea: `.env.example` (template sin secretos)

- [ ] **Paso 1: Completar `.env.local`**

Agregar las siguientes líneas al `.env.local` existente:

```env
# Webhook de LH2
LH_WEBHOOK_SECRET=cambiar_a_un_secreto_largo_aleatorio

# IA — Anthropic [PENDIENTE: confirmar si usar ANTHROPIC_API_KEY o ANTHROPIC_AUTH_TOKEN]
ANTHROPIC_API_KEY=sk-ant-...

# Puerto (opcional, Next.js usa 3000 por defecto)
# PORT=3000
```

- [ ] **Paso 2: Crear `.env.example`**

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...

# Webhook LH2
LH_WEBHOOK_SECRET=secreto_largo_aleatorio

# IA — Anthropic (elegir uno según el mecanismo de auth)
ANTHROPIC_API_KEY=sk-ant-...
# ANTHROPIC_AUTH_TOKEN=   # alternativa: token OAuth de suscripción Pro
```

- [ ] **Paso 3: Verificar que `.env.local` no está en git**

```powershell
cat .gitignore | Select-String ".env"
```

Esperado: línea con `.env*.local` o `.env.local`

- [ ] **Paso 4: Commit**

```powershell
git add .env.example
git commit -m "feat: agregar template de variables de entorno"
```

---

## Tarea 3: Cliente Supabase

**Archivos:**
- Crea: `src/lib/supabase/client.ts`
- Crea: `src/lib/supabase/server.ts`

- [ ] **Paso 1: Crear cliente browser**

`src/lib/supabase/client.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const supabaseBrowser = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

- [ ] **Paso 2: Crear cliente server (service_role)**

`src/lib/supabase/server.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export function createServerClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
```

- [ ] **Paso 3: Crear stub de tipos de la base de datos**

`src/types/database.ts`:
```typescript
// Tipos derivados del esquema Supabase (001_sales_cockpit_schema.sql)
// Generados manualmente por ahora; cuando Supabase CLI esté configurado,
// reemplazar con: supabase gen types typescript --local

export type LeadStatus =
  | "nuevo" | "contactado" | "respondio" | "en_conversacion"
  | "demo_agendada" | "estrategia_agendada"
  | "cliente" | "perdido" | "descartado";

export type CsGroup = "A" | "B" | "NO_ESCRIBIR";
export type MessageDirection = "inbound" | "outbound";
export type DraftStatus = "pending" | "edited" | "sent" | "discarded";
export type OutreachKind = "cold" | "fu1" | "fu2";
export type AiTaskType = "clasificacion" | "market_data" | "outreach" | "draft" | "other";

export interface Database {
  public: {
    Tables: {
      leads: { Row: Lead; Insert: LeadInsert; Update: Partial<LeadInsert> };
      messages: { Row: Message; Insert: MessageInsert; Update: Partial<MessageInsert> };
      drafts: { Row: Draft; Insert: DraftInsert; Update: Partial<DraftInsert> };
      outreach_sequence: { Row: OutreachSequence; Insert: OutreachSequenceInsert; Update: Partial<OutreachSequenceInsert> };
      market_data: { Row: MarketData; Insert: MarketDataInsert; Update: Partial<MarketDataInsert> };
      batches: { Row: Batch; Insert: BatchInsert; Update: Partial<BatchInsert> };
      followups: { Row: Followup; Insert: FollowupInsert; Update: Partial<FollowupInsert> };
      ai_usage: { Row: AiUsage; Insert: AiUsageInsert; Update: Partial<AiUsageInsert> };
    };
    Views: {
      leads_awaiting_reply: { Row: Lead & { pending_draft: string | null } };
      followups_due: { Row: Followup & { full_name: string | null; profile_url: string | null } };
      ai_spend_monthly: { Row: { month: string; task_type: AiTaskType; calls: number; cost_usd: number | null } };
    };
  };
}

export interface Lead {
  id: string;
  lh_id: string | null;
  profile_url: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  headline: string | null;
  summary: string | null;
  current_company: string | null;
  current_position: string | null;
  location_name: string | null;
  followers: number | null;
  website: string | null;
  has_premium: boolean;
  languages: string[] | null;
  cs_group: CsGroup | null;
  cs_city: string | null;
  cs_country: string | null;
  lead_status: LeadStatus;
  score: number | null;
  batch_id: string | null;
  notes: string | null;
  raw_profile: Record<string, unknown> | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}
export type LeadInsert = Omit<Lead, "id" | "created_at" | "updated_at" | "last_inbound_at" | "last_outbound_at" | "last_activity_at">;

export interface Message {
  id: string;
  lead_id: string;
  direction: MessageDirection;
  body: string;
  channel: string;
  source: "webhook" | "manual_paste" | "draft_sent" | "import";
  sent_at: string;
  created_at: string;
}
export type MessageInsert = Omit<Message, "id" | "created_at">;

export interface Draft {
  id: string;
  lead_id: string;
  in_reply_to_msg_id: string | null;
  body: string;
  model: string | null;
  trigger: "webhook" | "manual" | null;
  status: DraftStatus;
  generated_at: string;
  sent_at: string | null;
}
export type DraftInsert = Omit<Draft, "id" | "generated_at">;

export interface OutreachSequence {
  id: string;
  lead_id: string;
  kind: OutreachKind;
  body: string;
  char_count: number | null;
  model: string | null;
  generated_at: string;
}
export type OutreachSequenceInsert = Omit<OutreachSequence, "id" | "generated_at">;

export interface MarketData {
  id: string;
  country: string;
  city: string | null;
  stat: string;
  common_problem: string;
  source_note: string | null;
  model: string | null;
  raw: Record<string, unknown> | null;
  generated_at: string;
  expires_at: string | null;
}
export type MarketDataInsert = Omit<MarketData, "id" | "generated_at">;

export interface Batch {
  id: string;
  name: string;
  source: string | null;
  lead_count: number;
  imported_at: string;
}
export type BatchInsert = Omit<Batch, "id" | "imported_at">;

export interface Followup {
  id: string;
  lead_id: string;
  stage: "fu1" | "fu2" | "custom";
  due_at: string;
  done: boolean;
  done_at: string | null;
  note: string | null;
  created_at: string;
}
export type FollowupInsert = Omit<Followup, "id" | "created_at">;

export interface AiUsage {
  id: string;
  task_type: AiTaskType;
  model: string;
  provider: string | null;
  lead_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}
export type AiUsageInsert = Omit<AiUsage, "id" | "created_at">;
```

- [ ] **Paso 4: Commit**

```powershell
git add src/lib/supabase/ src/types/
git commit -m "feat: agregar clientes Supabase (browser y server) y tipos de la DB"
```

---

## Tarea 4: Aplicar migración 001 a Supabase

**Archivos:**
- Mueve: `001_sales_cockpit_schema.sql` → `supabase/migrations/001_sales_cockpit_schema.sql`

- [ ] **Paso 1: [PENDIENTE] Confirmar flujo de migraciones con Dylan**

Opciones:
- (a) Panel web de Supabase → SQL Editor → pegar el contenido del archivo
- (b) Supabase CLI: `supabase db push` (requiere instalar CLI y enlazar el proyecto)

**Por ahora, aplicar via panel web (opción más simple para Slice 1):**
1. Ir a https://supabase.com → dashboard del proyecto
2. SQL Editor → nueva query
3. Pegar el contenido completo de `001_sales_cockpit_schema.sql`
4. Ejecutar

- [ ] **Paso 2: Verificar que las tablas existen**

En el SQL Editor de Supabase, ejecutar:
```sql
select table_name from information_schema.tables
where table_schema = 'public'
order by table_name;
```

Esperado: `ai_usage`, `batches`, `drafts`, `followups`, `leads`, `market_data`, `messages`, `outreach_sequence`

- [ ] **Paso 3: Mover el archivo al directorio correcto**

```powershell
mkdir -p "e:\ITMANO\Captacion\supabase\migrations"
Move-Item "e:\ITMANO\Captacion\001_sales_cockpit_schema.sql" "e:\ITMANO\Captacion\supabase\migrations\001_sales_cockpit_schema.sql"
```

- [ ] **Paso 4: Commit**

```powershell
git add supabase/migrations/001_sales_cockpit_schema.sql
git commit -m "feat: mover migración 001 a supabase/migrations/ (estándar de Supabase CLI)"
```

---

## Tarea 5: Router de IA (stub)

**Archivos:**
- Crea: `src/lib/ai/types.ts`
- Crea: `src/lib/ai/router.ts`

- [ ] **Paso 1: Definir tipos del router**

`src/lib/ai/types.ts`:
```typescript
import type { AiTaskType } from "@/types/database";

export type { AiTaskType };

export interface AIRouterConfig {
  model: string;
  provider: "anthropic";
  costPerInputToken: number;
  costPerOutputToken: number;
}

export interface AICallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  model: string;
  provider: "anthropic";
  costUsd: number;
}

export interface AICallOptions {
  taskType: AiTaskType;
  systemPrompt: string;
  userMessage: string;
  leadId?: string;
  maxTokens?: number;
}
```

- [ ] **Paso 2: Implementar el router (stub que lanza error descriptivo)**

`src/lib/ai/router.ts`:
```typescript
import type { AICallOptions, AICallResult, AIRouterConfig } from "./types";
import type { AiTaskType } from "@/types/database";

// Ruteo de modelos por tarea (CLAUDE.md § 3)
// Clasificación/extracción → Haiku (barato); Generación → Sonnet (calidad)
const MODEL_ROUTING: Record<AiTaskType, AIRouterConfig> = {
  clasificacion: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
    costPerInputToken: 1.0 / 1_000_000,
    costPerOutputToken: 5.0 / 1_000_000,
  },
  market_data: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
    costPerInputToken: 1.0 / 1_000_000,
    costPerOutputToken: 5.0 / 1_000_000,
  },
  outreach: {
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    costPerInputToken: 3.0 / 1_000_000,
    costPerOutputToken: 15.0 / 1_000_000,
  },
  draft: {
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    costPerInputToken: 3.0 / 1_000_000,
    costPerOutputToken: 15.0 / 1_000_000,
  },
  other: {
    model: "claude-haiku-4-5",
    provider: "anthropic",
    costPerInputToken: 1.0 / 1_000_000,
    costPerOutputToken: 5.0 / 1_000_000,
  },
};

export function getRouterConfig(taskType: AiTaskType): AIRouterConfig {
  return MODEL_ROUTING[taskType];
}

// STUB: implementación real se cablea en Slice 2 tras verificar auth del Agent SDK
export async function callAI(_options: AICallOptions): Promise<AICallResult> {
  throw new Error(
    "Router de IA: stub activo. La implementación real se cablea en Slice 2 " +
    "tras verificar la autenticación del Agent SDK con la suscripción Pro."
  );
}
```

- [ ] **Paso 3: Commit**

```powershell
git add src/lib/ai/
git commit -m "feat: agregar router de IA con ruteo por tarea (stub — Slice 2 lo cablea)"
```

---

## Tarea 6: Healthcheck `/api/health`

**Archivos:**
- Crea: `src/app/api/health/route.ts`

- [ ] **Paso 1: Implementar el endpoint**

`src/app/api/health/route.ts`:
```typescript
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getRouterConfig } from "@/lib/ai/router";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // Verificar conexión a Supabase
  try {
    const supabase = createServerClient();
    const { error } = await supabase.from("ai_usage").select("id").limit(1);
    checks.supabase = error
      ? { ok: false, detail: error.message }
      : { ok: true };
  } catch (e) {
    checks.supabase = { ok: false, detail: String(e) };
  }

  // Verificar que el router de IA está configurado
  try {
    const config = getRouterConfig("draft");
    checks.ai_router = {
      ok: true,
      detail: `modelo activo: ${config.model} (stub — pendiente Slice 2)`,
    };
  } catch (e) {
    checks.ai_router = { ok: false, detail: String(e) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { ok: allOk, checks, timestamp: new Date().toISOString() },
    { status: allOk ? 200 : 503 }
  );
}
```

- [ ] **Paso 2: Arrancar el servidor y probar**

```powershell
pnpm dev
```

En otro terminal:
```powershell
curl http://localhost:3000/api/health
```

Esperado:
```json
{
  "ok": true,
  "checks": {
    "supabase": { "ok": true },
    "ai_router": { "ok": true, "detail": "modelo activo: claude-sonnet-4-6 (stub — pendiente Slice 2)" }
  },
  "timestamp": "..."
}
```

- [ ] **Paso 3: Commit**

```powershell
git add src/app/api/health/
git commit -m "feat: agregar healthcheck /api/health (Supabase + router de IA)"
```

---

## Tarea 7: Página placeholder del cockpit

**Archivos:**
- Modifica: `src/app/page.tsx`
- Modifica: `src/app/layout.tsx`

- [ ] **Paso 1: Reemplazar el contenido de `page.tsx`**

`src/app/page.tsx`:
```tsx
export default function CockpitPage() {
  return (
    <main className="min-h-screen bg-background p-8">
      <h1 className="text-2xl font-semibold text-foreground">
        ITMANO Sales Cockpit
      </h1>
      <p className="mt-2 text-muted-foreground">
        Slice 1 completado — fundaciones listas.
      </p>
      <a
        href="/api/health"
        className="mt-4 inline-block text-sm text-blue-600 underline"
      >
        Ver healthcheck →
      </a>
    </main>
  );
}
```

- [ ] **Paso 2: Actualizar metadata en `layout.tsx`**

En `src/app/layout.tsx`, actualizar la constante `metadata`:
```typescript
export const metadata: Metadata = {
  title: "ITMANO Sales Cockpit",
  description: "Herramienta interna de prospección B2B",
};
```

- [ ] **Paso 3: Build final para confirmar sin errores**

```powershell
pnpm build
```

- [ ] **Paso 4: Commit final del Slice 1**

```powershell
git add src/app/page.tsx src/app/layout.tsx
git commit -m "feat: página placeholder del cockpit — Slice 1 completo"
```

---

## Preguntas pendientes (bloquean o modifican pasos específicos)

| # | Pregunta | Impacta |
|---|----------|---------|
| 1 | **[CRÍTICO] ¿Cómo se autentica el Agent SDK con la suscripción Pro?** ¿Mediante `ANTHROPIC_AUTH_TOKEN` (token OAuth del login de Claude Code) o necesitás una API key separada? | Tarea 2 (env vars) y toda la Tarea de Slice 2 |
| 2 | **¿Querés crear el scaffold en la raíz de `e:\ITMANO\Captacion\`** (mezcla con archivos existentes) o en un subdirectorio (ej. `app/`)? | Tarea 1 |
| 3 | **¿Qué flujo de migraciones preferís?** Panel web de Supabase (simple) vs Supabase CLI (`supabase db push`) | Tarea 4 |
| 4 | **¿Querés alguna protección local?** La app es localhost — sin protección es válido para un solo usuario, o puedo agregar un middleware simple con contraseña | Tarea opcional entre 6 y 7 |
| 5 | **¿Puerto 3000 está bien?** O preferís otro (LH2 tiene que apuntar ahí en el Slice 3) | Tarea 2 |
