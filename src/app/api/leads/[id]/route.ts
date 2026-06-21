import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { LeadStatus } from "@/types/database";
import { CLOSING_REASON_KEYS, ANSWER_QUALITY_KEYS } from "@/lib/ui-helpers";

const VALID_STATUSES: LeadStatus[] = [
  "without_answer",
  "opener_answered",
  "fu1_sent",
  "fu2_sent",
  "in_follow_up",
  "interested",
  "in_demo",
  "in_strategy",
  "client",
  "closed",
  "passive_discard",
  "rejected",
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
  const update: Record<string, unknown> = {};

  // lead_status (opcional) — validado contra los 12 estados canónicos
  if ("lead_status" in b) {
    const status = b.lead_status;
    if (typeof status !== "string" || !VALID_STATUSES.includes(status as LeadStatus)) {
      return NextResponse.json(
        { error: `lead_status inválido. Valores permitidos: ${VALID_STATUSES.join(", ")}.` },
        { status: 400 }
      );
    }
    update.lead_status = status;
  }

  // closing_reason (opcional) — clave de lista cerrada o null para limpiar
  if ("closing_reason" in b) {
    const reason = b.closing_reason;
    if (reason !== null && (typeof reason !== "string" || !CLOSING_REASON_KEYS.includes(reason))) {
      return NextResponse.json(
        { error: `closing_reason inválido. Valores permitidos: ${CLOSING_REASON_KEYS.join(", ")}, o null.` },
        { status: 400 }
      );
    }
    update.closing_reason = reason;
  }

  // answer_quality (opcional) — clave de lista cerrada o null para limpiar
  if ("answer_quality" in b) {
    const quality = b.answer_quality;
    if (quality !== null && (typeof quality !== "string" || !ANSWER_QUALITY_KEYS.includes(quality))) {
      return NextResponse.json(
        { error: `answer_quality inválido. Valores permitidos: ${ANSWER_QUALITY_KEYS.join(", ")}, o null.` },
        { status: 400 }
      );
    }
    update.answer_quality = quality;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json(
      { error: "No se envió ningún campo válido para actualizar." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("leads")
    .update(update as never)
    .eq("id", leadId);

  if (error) {
    return NextResponse.json(
      { error: `Error al actualizar el lead: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json(update);
}
