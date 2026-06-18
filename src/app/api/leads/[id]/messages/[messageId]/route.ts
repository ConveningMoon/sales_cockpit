import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string; messageId: string }> };

// Solo actualiza el body del mensaje — no regenera borrador.
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id: leadId, messageId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  const body = typeof b.body === "string" ? b.body.trim() : "";

  if (!body) {
    return NextResponse.json(
      { error: "El campo 'body' es requerido y no puede estar vacío." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verificar que el mensaje existe y pertenece al lead
  const { data: msg } = await supabase
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (!msg) {
    return NextResponse.json(
      { error: `Mensaje ${messageId} no encontrado para este lead.` },
      { status: 404 }
    );
  }

  const { error } = await supabase
    .from("messages")
    .update({ body })
    .eq("id", messageId);

  if (error) {
    return NextResponse.json(
      { error: `Error al actualizar el mensaje: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: messageId, body });
}
