import { NextRequest, NextResponse } from "next/server";
import { appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createServerClient } from "@/lib/supabase/server";
import { parseLh2Payload } from "@/lib/lh/parser";
import type { LeadStatus } from "@/types/database";

// Etapas activas que no se degradan al recibir un nuevo inbound.
// "perdido" y "descartado" SÍ se reactivaron a "respondio" (el lead volvió).
const PROTECTED_STATUSES = new Set<LeadStatus>([
  "en_conversacion",
  "demo_agendada",
  "estrategia_agendada",
  "cliente",
]);

function validateSecret(req: NextRequest): boolean {
  const secret = process.env.LH_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[lh-webhook] LH_WEBHOOK_SECRET no está definido.");
    return false;
  }
  const fromQuery = req.nextUrl.searchParams.get("secret");
  const fromHeader = req.headers.get("x-webhook-secret");
  return fromQuery === secret || fromHeader === secret;
}

function appendCapture(body: unknown, headers: Record<string, string>) {
  // Solo en desarrollo — registra el payload crudo para diagnóstico
  if (process.env.NODE_ENV !== "development") return;
  try {
    const logsDir = join(process.cwd(), "logs");
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(
      join(logsDir, "lh-webhook-capture.json"),
      JSON.stringify({ timestamp: new Date().toISOString(), headers, body }, null, 2) + "\n---\n"
    );
  } catch (err) {
    console.error("[lh-webhook] Error al escribir captura:", err);
  }
}

export async function POST(req: NextRequest) {
  // 1. Validar secreto
  if (!validateSecret(req)) {
    console.warn("[lh-webhook] Secreto inválido — request rechazado.");
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  // 2. Leer body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — se esperaba JSON." }, { status: 400 });
  }

  // Captura dev (no bloquea)
  appendCapture(rawBody, Object.fromEntries(req.headers.entries()));

  // 3. Validar que el body sea un objeto plano (no array ni primitivo)
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return NextResponse.json(
      { error: "Payload inválido — se esperaba un objeto JSON." },
      { status: 400 }
    );
  }

  const body = rawBody as Record<string, unknown>;

  // 4. Parsear payload → lead + mensajes
  let parsed: ReturnType<typeof parseLh2Payload>;
  try {
    parsed = parseLh2Payload(body);
  } catch (err) {
    console.error("[lh-webhook] Error al parsear payload:", err);
    return NextResponse.json(
      { error: `Payload inválido: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // 5. Determinar lead_status: no degradar etapas activas avanzadas
  const { data: existing } = await supabase
    .from("leads")
    .select("id, lead_status")
    .eq("lh_id", parsed.lead.lh_id!)
    .maybeSingle();

  const newStatus: LeadStatus =
    existing && PROTECTED_STATUSES.has(existing.lead_status as LeadStatus)
      ? (existing.lead_status as LeadStatus)
      : "respondio";

  // 6. Upsert del lead (solo campos LH2 + status; no toca cs_group, score, notes, batch_id)
  const { data: upsertedLead, error: leadError } = await supabase
    .from("leads")
    .upsert(
      { ...parsed.lead, lead_status: newStatus },
      { onConflict: "lh_id" }
    )
    .select("id, full_name, lead_status")
    .single();

  if (leadError || !upsertedLead) {
    console.error("[lh-webhook] Error al hacer upsert del lead:", leadError);
    return NextResponse.json(
      { error: "Error interno al guardar el lead." },
      { status: 500 }
    );
  }

  const leadId = upsertedLead.id;

  // 7. Insertar mensajes con idempotencia: skip si ya existe (lead_id, sent_at)
  let messagesIngested = 0;
  for (const msg of parsed.messages) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("sent_at", msg.sent_at);

    if (count && count > 0) {
      console.log(`[lh-webhook] Mensaje duplicado — skip (lead=${leadId}, sent_at=${msg.sent_at})`);
      continue;
    }

    const { error: msgError } = await supabase.from("messages").insert({
      lead_id: leadId,
      direction: msg.direction,
      body: msg.body,
      channel: "linkedin",
      source: "webhook",
      sent_at: msg.sent_at,
    });

    if (msgError) {
      console.error("[lh-webhook] Error al insertar mensaje:", msgError);
    } else {
      messagesIngested++;
    }
  }

  console.log(
    `[lh-webhook] OK — lead="${upsertedLead.full_name}" (${leadId}) status=${upsertedLead.lead_status} mensajes=${messagesIngested}`
  );

  return NextResponse.json({
    ok: true,
    leadId,
    leadStatus: upsertedLead.lead_status,
    messagesIngested,
  });
}
