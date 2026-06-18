import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseConversation } from "@/lib/ai/conversation-parser";

type RouteContext = { params: Promise<{ id: string }> };

// POST /api/leads/[id]/parse-conversation
// Body: { raw_text: string, my_name: string }
// Llama a Haiku para extraer mensajes estructurados del texto pegado.
// No inserta nada en DB — devuelve el preview para que el usuario lo revise.
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: leadId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  const rawText = typeof b.raw_text === "string" ? b.raw_text.trim() : "";
  const myName = typeof b.my_name === "string" ? b.my_name.trim() : "";

  if (!rawText) {
    return NextResponse.json(
      { error: "El campo 'raw_text' es requerido." },
      { status: 400 }
    );
  }
  if (!myName) {
    return NextResponse.json(
      { error: "El campo 'my_name' es requerido." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("id, full_name")
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) {
    return NextResponse.json(
      { error: `Lead ${leadId} no encontrado.` },
      { status: 404 }
    );
  }

  const leadName = lead.full_name ?? "Lead";

  try {
    const messages = await parseConversation({
      rawText,
      leadName,
      myName,
      leadId,
    });

    return NextResponse.json({ messages, lead_name: leadName });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Error al parsear la conversación.",
      },
      { status: 500 }
    );
  }
}
