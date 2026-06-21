import { readFileSync } from "fs";
import { join } from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { callAI } from "./router";
import { ITMANO_BASE_SYSTEM_PROMPT } from "./voice";

export type FuType = "fu1" | "fu2";

let _followupSystemPrompt: string | undefined;

function getFollowupSystemPrompt(): string {
  if (_followupSystemPrompt) return _followupSystemPrompt;
  const promptPath = join(process.cwd(), "prompts", "reengagement.md");
  let reengagementPrompt: string;
  try {
    reengagementPrompt = readFileSync(promptPath, "utf-8");
  } catch {
    throw new Error(
      `[followup] No se encontró prompts/reengagement.md en ${promptPath}. ` +
        "Asegúrate de que el archivo exista y que el directorio /prompts esté incluido en el deploy."
    );
  }
  _followupSystemPrompt = `${ITMANO_BASE_SYSTEM_PROMPT}\n\n---\n\n${reengagementPrompt}`;
  return _followupSystemPrompt;
}

export interface GenerateFollowupParams {
  leadId: string;
  fuType: FuType;
  supabase: SupabaseClient<Database>;
}

export interface GenerateFollowupResult {
  body: string;
  model: string;
}

export async function generateFollowup(
  params: GenerateFollowupParams
): Promise<GenerateFollowupResult> {
  const { leadId, fuType, supabase } = params;

  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select(
      "full_name, headline, current_company, current_position, location_name, summary, cs_group"
    )
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    throw new Error(
      `[followup] Lead ${leadId} no encontrado: ${leadErr?.message ?? "sin datos"}`
    );
  }

  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("direction, body, sent_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  if (msgErr) {
    throw new Error(`[followup] Error al leer hilo: ${msgErr.message}`);
  }

  const userMessage = buildFollowupUserMessage(lead, messages ?? [], fuType);

  const aiResult = await callAI({
    taskType: "reengagement",
    systemPrompt: getFollowupSystemPrompt(),
    userMessage,
    leadId,
    maxTokens: 512,
  });

  if (!aiResult.content.trim()) {
    throw new Error(
      `[followup] El modelo "${aiResult.model}" devolvió content vacío.`
    );
  }

  return { body: aiResult.content.trim(), model: aiResult.model };
}

type LeadRow = {
  full_name: string | null;
  headline: string | null;
  current_company: string | null;
  current_position: string | null;
  location_name: string | null;
  summary: string | null;
  cs_group: string | null;
};

type MessageRow = { direction: string; body: string; sent_at: string };

function buildFollowupUserMessage(
  lead: LeadRow,
  messages: MessageRow[],
  fuType: FuType
): string {
  const lines: string[] = [];

  lines.push(`## Contexto del seguimiento\n`);
  lines.push(
    `Tipo de follow-up: ${fuType} — ${fuType === "fu1" ? "re-pregunta genuina" : "oferta concreta + puerta abierta"}\n`
  );

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
  if (lead.cs_group) lines.push(`Clasificación: Grupo ${lead.cs_group}`);
  if (lead.summary) {
    const summary =
      lead.summary.length > 800
        ? lead.summary.slice(0, 800).trimEnd() + "…"
        : lead.summary;
    lines.push(`\nSummary:\n${summary}`);
  }

  if (messages.length > 0) {
    lines.push("\n## Hilo de conversación\n");
    for (const msg of messages) {
      const who = msg.direction === "outbound" ? "Dylan" : "Lead";
      const date = msg.sent_at.split("T")[0];
      lines.push(`${who} (${date}):\n${msg.body}\n`);
    }
  }

  lines.push("---\nRedacta el mensaje de follow-up de re-enganche.");

  return lines.join("\n");
}
