import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { insertMessage } from "@/lib/leads/messages";
import type { MessageInsert } from "@/types/database";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: leadId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  const draftId = typeof b.draft_id === "string" ? b.draft_id : null;
  const body = typeof b.body === "string" ? b.body.trim() : "";

  if (!draftId || !body) {
    return NextResponse.json(
      { error: "draft_id y body son requeridos." },
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

  // Verificar que el draft pertenece al lead
  const { data: draft } = await supabase
    .from("drafts")
    .select("id, status")
    .eq("id", draftId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (!draft) {
    return NextResponse.json(
      { error: `Draft ${draftId} no encontrado para este lead.` },
      { status: 404 }
    );
  }

  const sentAt = new Date().toISOString();

  // Insertar mensaje outbound usando la función compartida
  const payload: MessageInsert = {
    lead_id: leadId,
    direction: "outbound",
    body,
    channel: "linkedin",
    source: "draft_sent",
    sent_at: sentAt,
  };

  let msgId: string;
  try {
    const msg = await insertMessage(supabase, payload);
    msgId = msg.id;
  } catch (err) {
    return NextResponse.json(
      {
        error: `Error al registrar mensaje: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      { status: 500 }
    );
  }

  // Marcar draft como enviado, guardar el cuerpo final editado
  const { error: draftErr } = await supabase
    .from("drafts")
    .update({ status: "sent", body, sent_at: sentAt })
    .eq("id", draftId);

  if (draftErr) {
    // El mensaje ya se insertó — no revertimos; logueamos y devolvemos éxito
    console.error("[send] Error al marcar draft:", draftErr.message);
  }

  return NextResponse.json({ message_id: msgId, draft_id: draftId, sent_at: sentAt });
}
