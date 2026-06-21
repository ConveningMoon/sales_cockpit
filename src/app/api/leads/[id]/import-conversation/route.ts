import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import {
  assignTimestamps,
  normalizeBody,
  type RawParsedMessage,
} from "@/lib/ai/conversation-parser";
import { insertMessage } from "@/lib/leads/messages";
import { generateDraft } from "@/lib/ai/draft";
import type { MessageInsert } from "@/types/database";

type RouteContext = { params: Promise<{ id: string }> };

interface ImportRequest {
  messages: RawParsedMessage[]; // array ya revisado/corregido por el usuario
}

// POST /api/leads/[id]/import-conversation
// Inserta en DB los mensajes confirmados por el usuario, con dedup app-level.
// Si el último mensaje del array es inbound, genera UN solo borrador al final.
// Actualiza lead_status si el último mensaje es inbound (reusa computeLeadStatus).
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: leadId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as ImportRequest;
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    return NextResponse.json(
      { error: "El campo 'messages' debe ser un array no vacío." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verificar que el lead existe
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json(
      { error: `Lead ${leadId} no encontrado.` },
      { status: 404 }
    );
  }

  // Cargar mensajes existentes para dedup en memoria
  const { data: existingMessages } = await supabase
    .from("messages")
    .select("direction, body")
    .eq("lead_id", leadId);

  const existingKeys = new Set<string>(
    (existingMessages ?? []).map(
      (m) => `${m.direction}|${normalizeBody(m.body as string)}`
    )
  );

  // Asignar timestamps en orden (el orden del array es la fuente de verdad)
  const timestamped = assignTimestamps(b.messages);

  let inserted = 0;
  let skipped = 0;
  let lastInsertedMsgId: string | null = null;

  for (const msg of timestamped) {
    const key = `${msg.direction}|${normalizeBody(msg.body)}`;
    if (existingKeys.has(key)) {
      skipped++;
      continue;
    }

    const payload: MessageInsert = {
      lead_id: leadId,
      direction: msg.direction,
      body: msg.body,
      channel: "linkedin",
      source: "import",
      sent_at: msg.sent_at,
    };

    const { id } = await insertMessage(supabase, payload);
    existingKeys.add(key); // evitar duplicados dentro del mismo lote
    inserted++;
    lastInsertedMsgId = id;
  }

  // Determinar el último mensaje del array (fuente de verdad para el borrador)
  // — no se re-consulta por sent_at para evitar dependencia de precisión del timestamp.
  const lastMsg = b.messages[b.messages.length - 1];
  const lastIsInbound = lastMsg.direction === "inbound";

  // Generar UN solo borrador al final, solo si el último mensaje es inbound
  let draft: { id: string; body: string; model: string } | null = null;
  let draftError: string | null = null;

  if (lastIsInbound && inserted > 0) {
    try {
      const result = await generateDraft({
        leadId,
        inReplyToMsgId: lastInsertedMsgId,
        supabase,
      });
      draft = { id: result.draftId, body: result.body, model: result.model };
    } catch (err) {
      draftError = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    inserted,
    skipped,
    last_direction: lastMsg.direction,
    draft,
    draft_error: draftError,
  });
}
