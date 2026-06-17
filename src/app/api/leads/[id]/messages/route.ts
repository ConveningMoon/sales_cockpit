import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { generateDraft } from "@/lib/ai/draft";
import type { MessageInsert } from "@/types/database";

// En Next.js 15, los params de rutas dinámicas son una Promise.
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: leadId } = await params;

  // 1. Parsear body
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  const direction = b?.direction;
  const text = b?.body;
  const sentAt =
    typeof b?.sent_at === "string" ? b.sent_at : new Date().toISOString();
  const modelOverride = typeof b?.model === "string" ? b.model : undefined;
  const webSearch = b?.web_search === true;

  // 2. Validar campos requeridos
  if (direction !== "inbound" && direction !== "outbound") {
    return NextResponse.json(
      {
        error:
          "Campo 'direction' requerido. Valores válidos: 'inbound' | 'outbound'.",
      },
      { status: 400 }
    );
  }

  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json(
      { error: "Campo 'body' requerido y no puede estar vacío." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // 3. Verificar que el lead existe
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, full_name")
    .eq("id", leadId)
    .maybeSingle();

  if (leadErr) {
    return NextResponse.json(
      { error: `Error al verificar el lead: ${leadErr.message}` },
      { status: 500 }
    );
  }

  if (!lead) {
    return NextResponse.json(
      { error: `Lead ${leadId} no encontrado.` },
      { status: 404 }
    );
  }

  // 4. Insertar mensaje
  // source: 'manual_paste' para ambas direcciones en este endpoint (ingesta manual del cockpit)
  const newMessage: MessageInsert = {
    lead_id: leadId,
    direction,
    body: text.trim(),
    channel: "linkedin",
    source: "manual_paste",
    sent_at: sentAt,
  };
  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert(newMessage)
    .select("id")
    .single();

  if (msgErr || !msg) {
    return NextResponse.json(
      {
        error: `Error al registrar el mensaje: ${msgErr?.message ?? "sin datos"}`,
      },
      { status: 500 }
    );
  }

  const msgId = msg.id as string;

  // 5. Outbound → solo registrar, sin borrador
  if (direction === "outbound") {
    return NextResponse.json({
      message: { id: msgId, direction, sent_at: sentAt },
    });
  }

  // 6. Inbound → generar borrador automático con Sonnet 4.6 (o model override)
  try {
    const draft = await generateDraft({
      leadId,
      inReplyToMsgId: msgId,
      model: modelOverride,
      webSearch,
      supabase,
    });

    return NextResponse.json({
      message: { id: msgId, direction, sent_at: sentAt },
      draft: {
        id: draft.draftId,
        body: draft.body,
        model: draft.model,
      },
    });
  } catch (aiErr) {
    // El mensaje ya está en DB; devolvemos 200 con draft=null para que no se pierda el registro.
    // El borrador puede regenerarse con una nueva llamada al mismo endpoint.
    console.error("[api/leads/messages] Error al generar borrador:", aiErr);
    return NextResponse.json(
      {
        message: { id: msgId, direction, sent_at: sentAt },
        draft: null,
        draft_error:
          aiErr instanceof Error ? aiErr.message : String(aiErr),
      },
      { status: 200 }
    );
  }
}
