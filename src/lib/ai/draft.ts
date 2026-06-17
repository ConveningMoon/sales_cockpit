import { readFileSync } from "fs";
import { join } from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, DraftInsert } from "@/types/database";
import { callAI } from "./router";
import { ITMANO_BASE_SYSTEM_PROMPT } from "./voice";

// Cargado una vez en la primera llamada y cacheado — lazy para que @vercel/nft
// pueda trazar el path en tiempo de build sin que el módulo falle en análisis estático.
let _draftSystemPrompt: string | undefined;

function getDraftSystemPrompt(): string {
  if (_draftSystemPrompt) return _draftSystemPrompt;
  const promptPath = join(process.cwd(), "prompts", "respuesta-lead.md");
  let respuestaLeadPrompt: string;
  try {
    respuestaLeadPrompt = readFileSync(promptPath, "utf-8");
  } catch {
    throw new Error(
      `[draft] No se encontró prompts/respuesta-lead.md en ${promptPath}. ` +
        "Asegúrate de que el archivo exista y que el directorio /prompts esté incluido en el deploy."
    );
  }
  // System prompt compuesto: voz base ITMANO + reglas específicas de respuesta a lead.
  // El proveedor Anthropic aplica cache_control ephemeral → caching en hits repetidos.
  _draftSystemPrompt = `${ITMANO_BASE_SYSTEM_PROMPT}\n\n---\n\n${respuestaLeadPrompt}`;
  return _draftSystemPrompt;
}

export interface GenerateDraftParams {
  leadId: string;
  inReplyToMsgId?: string | null;
  model?: string;
  webSearch?: boolean;
  supabase: SupabaseClient<Database>;
}

export interface GenerateDraftResult {
  draftId: string;
  body: string;
  model: string;
}

export async function generateDraft(
  params: GenerateDraftParams
): Promise<GenerateDraftResult> {
  const {
    leadId,
    inReplyToMsgId = null,
    model,
    webSearch = false,
    supabase,
  } = params;

  // 1. Perfil del lead
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      "full_name, headline, current_company, current_position, location_name, summary, website, cs_group, raw_profile"
    )
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    throw new Error(
      `[draft] Lead ${leadId} no encontrado: ${leadErr?.message ?? "sin datos"}`
    );
  }

  // 2. Hilo completo de mensajes ordenado cronológicamente
  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("direction, body, sent_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  if (msgErr) {
    throw new Error(
      `[draft] Error al leer hilo de mensajes: ${msgErr.message}`
    );
  }

  // 3. Construir mensaje de usuario
  const userMessage = buildUserMessage(lead, messages ?? []);

  // 4. Llamar al router de IA — default Sonnet 4.6 (task_type: "draft")
  // maxTokens: 2048 como techo uniforme y generoso; modelos de razonamiento (Kimi K2.6)
  // necesitan ese margen para el pensamiento interno antes de producir content.
  // La calibración de longitud de respuesta se delega al prompt (semánticamente correcta).
  const aiResult = await callAI({
    taskType: "draft",
    systemPrompt: getDraftSystemPrompt(),
    userMessage,
    ...(model ? { model } : {}),
    leadId,
    maxTokens: 2048,
    webSearch,
  });

  // Guard: content vacío = modelo agotó budget en razonamiento interno.
  // Nunca enviar el reasoning como borrador.
  if (!aiResult.content.trim()) {
    throw new Error(
      `[draft] El modelo "${aiResult.model}" devolvió content vacío. ` +
        "El razonamiento interno agotó el budget de tokens. " +
        "Intenta sin override de modelo o aumenta maxTokens."
    );
  }

  const body = aiResult.content.trim();

  // 5. Guardar borrador en DB (status='pending', trigger='manual')
  const newDraft: DraftInsert = {
    lead_id: leadId,
    in_reply_to_msg_id: inReplyToMsgId,
    body,
    model: aiResult.model,
    trigger: "manual",
    status: "pending",
    sent_at: null,
  };
  const { data: draft, error: draftErr } = await supabase
    .from("drafts")
    .insert(newDraft)
    .select("id")
    .single();

  if (draftErr || !draft) {
    throw new Error(
      `[draft] Error al guardar borrador: ${draftErr?.message ?? "sin datos"}`
    );
  }

  return {
    draftId: draft.id as string,
    body,
    model: aiResult.model,
  };
}

// ---------------------------------------------------------------------------
// Construcción del mensaje de usuario
// ---------------------------------------------------------------------------

type LeadRow = {
  full_name: string | null;
  headline: string | null;
  current_company: string | null;
  current_position: string | null;
  location_name: string | null;
  summary: string | null;
  website: string | null;
  cs_group: string | null;
  raw_profile: Record<string, unknown> | null;
};

type MessageRow = {
  direction: string;
  body: string;
  sent_at: string;
};

function buildUserMessage(lead: LeadRow, messages: MessageRow[]): string {
  const lines: string[] = [];

  // --- Perfil del lead ---
  lines.push("## Perfil del lead\n");
  if (lead.full_name) lines.push(`Nombre: ${lead.full_name}`);
  if (lead.headline) lines.push(`Headline: ${lead.headline}`);
  if (lead.current_position && lead.current_company) {
    lines.push(`Cargo: ${lead.current_position} en ${lead.current_company}`);
  } else if (lead.current_position) {
    lines.push(`Cargo: ${lead.current_position}`);
  } else if (lead.current_company) {
    lines.push(`Empresa: ${lead.current_company}`);
  }
  if (lead.location_name) lines.push(`Ubicación: ${lead.location_name}`);
  if (lead.website) lines.push(`Web: ${lead.website}`);
  if (lead.cs_group) lines.push(`Clasificación: Grupo ${lead.cs_group}`);

  if (lead.summary) {
    // Target ~1000 chars; truncar solo si es absurdamente largo (>1500)
    const summary =
      lead.summary.length > 1500
        ? lead.summary.slice(0, 1500).trimEnd() + "…"
        : lead.summary;
    lines.push(`\nSummary (LinkedIn):\n${summary}`);
  }

  // --- Contexto de mercado ---
  const parrafo = lead.raw_profile?.cs_parrafo_mercado;
  if (parrafo && typeof parrafo === "string") {
    lines.push(`\n## Contexto de mercado\n${parrafo}`);
  }

  // --- Hilo de conversación ---
  if (messages.length > 0) {
    lines.push("\n## Hilo de conversación\n");
    for (const msg of messages) {
      const who = msg.direction === "outbound" ? "Dylan" : "Lead";
      const date = msg.sent_at.split("T")[0];
      lines.push(`${who} (${date}):\n${msg.body}\n`);
    }
  }

  lines.push("---\nRedacta la respuesta de Dylan.");

  return lines.join("\n");
}
