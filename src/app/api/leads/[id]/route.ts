import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/types/database";

const VALID_STATUSES: LeadStatus[] = [
  "nuevo",
  "contactado",
  "respondio",
  "en_conversacion",
  "demo_agendada",
  "estrategia_agendada",
  "cliente",
  "perdido",
  "descartado",
];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: leadId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  const status = b.lead_status;

  if (typeof status !== "string" || !VALID_STATUSES.includes(status as LeadStatus)) {
    return NextResponse.json(
      { error: `lead_status inválido. Valores permitidos: ${VALID_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("leads")
    .update({ lead_status: status as LeadStatus })
    .eq("id", leadId);

  if (error) {
    return NextResponse.json(
      { error: `Error al actualizar el estado: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ lead_status: status });
}
