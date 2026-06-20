import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, LeadStatus, MessageSource } from "@/types/database";
import type { Lh2LeadData, Lh2MessageData } from "@/lib/lh/parser";

// Etapas activas que no se degradan al recibir nuevo inbound.
// "perdido" y "descartado" SÍ se reactivan a "respondio" (el lead volvió).
export const PROTECTED_STATUSES = new Set<LeadStatus>([
  "en_conversacion",
  "demo_agendada",
  "estrategia_agendada",
  "cliente",
]);

export function computeLeadStatus(existing: LeadStatus | null): LeadStatus {
  if (existing && PROTECTED_STATUSES.has(existing)) return existing;
  return "respondio";
}

// newLeadStatus: status a asignar cuando el lead NO existe aún.
// Usar "nuevo" para importación CSV (prospección); el default "respondio" es para inbound via cockpit.
// batchId: si se pasa, se escribe en leads.batch_id (actualiza al batch más reciente en re-import).
export async function upsertLead(
  supabase: SupabaseClient<Database>,
  leadData: Lh2LeadData,
  newLeadStatus: LeadStatus = "respondio",
  batchId?: string | null
): Promise<{ id: string; lead_status: LeadStatus; full_name: string | null }> {
  const { data: existing } = await supabase
    .from("leads")
    .select("id, lead_status")
    .eq("lh_id", leadData.lh_id!)
    .maybeSingle();

  const newStatus = existing
    ? computeLeadStatus(existing.lead_status as LeadStatus)
    : newLeadStatus;

  // Supabase upsert solo incluye los campos proporcionados en el UPDATE SET;
  // los campos ausentes (cs_group, score, etc.) no se sobreescriben en leads existentes.
  // La aserción es segura — el runtime maneja correctamente el partial insert.
  const upsertPayload: Record<string, unknown> = { ...leadData, lead_status: newStatus };
  if (batchId !== undefined) upsertPayload.batch_id = batchId;

  const { data, error } = await supabase
    .from("leads")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .upsert(upsertPayload as any, { onConflict: "lh_id" })
    .select("id, full_name, lead_status")
    .single();

  if (error || !data) {
    throw new Error(`Error al guardar el lead: ${error?.message ?? "desconocido"}`);
  }

  return {
    id: data.id,
    lead_status: data.lead_status as LeadStatus,
    full_name: data.full_name,
  };
}

// Inserta mensajes con idempotencia por (lead_id, sent_at).
// source indica el origen: "import" para CSV/LH2, "manual_paste" para entrada manual del cockpit.
export async function insertMessages(
  supabase: SupabaseClient<Database>,
  leadId: string,
  messages: Lh2MessageData[],
  source: MessageSource = "import"
): Promise<{ ingested: number; skipped: number }> {
  let ingested = 0;
  let skipped = 0;

  for (const msg of messages) {
    const { count } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", leadId)
      .eq("sent_at", msg.sent_at);

    if (count && count > 0) {
      skipped++;
      continue;
    }

    const { error } = await supabase.from("messages").insert({
      lead_id: leadId,
      direction: msg.direction,
      body: msg.body,
      channel: "linkedin",
      source,
      sent_at: msg.sent_at,
    });

    if (error) {
      console.error("[ingest] Error al insertar mensaje:", error);
    } else {
      ingested++;
    }
  }

  return { ingested, skipped };
}
