import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai/router";
import { getClasificacionPrompt, cleanJsonOutput } from "@/lib/ai/prompts";

export const maxDuration = 60;

const CHUNK_SIZE = 20;

type ClassifyResult = {
  cs_group: "A" | "B" | "NO_ESCRIBIR";
  cs_city: string | null;
  cs_country: string | null;
};

function parseClassifyJson(raw: string): ClassifyResult {
  const text = cleanJsonOutput(raw);
  const data = JSON.parse(text) as Record<string, unknown>;

  const group = data.cs_group;
  if (group !== "A" && group !== "B" && group !== "NO_ESCRIBIR") {
    throw new Error(`cs_group inválido: ${String(group)}`);
  }

  return {
    cs_group: group,
    cs_city: typeof data.cs_city === "string" && data.cs_city !== "null" ? data.cs_city : null,
    cs_country: typeof data.cs_country === "string" && data.cs_country !== "null" ? data.cs_country : null,
  };
}

function buildUserMessage(template: string, lead: Record<string, unknown>): string {
  return template
    .replace("{full_name}", String(lead.full_name ?? ""))
    .replace("{headline}", String(lead.headline ?? ""))
    .replace("{role}", String(lead.current_position ?? ""))
    .replace("{company}", String(lead.current_company ?? ""))
    .replace("{location}", String(lead.location_name ?? [lead.cs_city, lead.cs_country].filter(Boolean).join(", ") ?? ""))
    .replace("{industry}", "")
    .replace("{summary}", String(lead.summary ?? "").slice(0, 800))
    .replace("{extra}", "");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = createServerClient();

  // Verificar que el batch existe y está en estado clasificable
  const { data: batch } = await supabase
    .from("batches")
    .select("id, status, lead_count")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json(
      { error: "Batch no encontrado.", stage: "classify" },
      { status: 404 },
    );
  }
  if (batch.status !== "pending" && batch.status !== "classifying") {
    return NextResponse.json(
      {
        error: `El batch está en estado "${batch.status}", no se puede clasificar.`,
        stage: "classify",
        context: { batchStatus: batch.status },
      },
      { status: 409 },
    );
  }

  // Avanzar a 'classifying' en el primer chunk
  if (batch.status === "pending") {
    await supabase
      .from("batches")
      .update({ status: "classifying" } as Record<string, unknown>)
      .eq("id", batchId);
  }

  // Leads de este batch sin clasificar
  const { data: leads } = await supabase
    .from("leads")
    .select("id, full_name, headline, current_position, current_company, location_name, cs_city, cs_country, summary")
    .eq("batch_id", batchId)
    .is("cs_group", null)
    .limit(CHUNK_SIZE);

  const pending = leads ?? [];
  const { system, userTemplate } = getClasificacionPrompt();

  let classified = 0;
  const errors: { leadId: string; message: string }[] = [];

  for (const lead of pending) {
    const userMessage = buildUserMessage(userTemplate, lead as unknown as Record<string, unknown>);
    try {
      const result = await callAI({
        taskType: "clasificacion",
        systemPrompt: system,
        userMessage,
        maxTokens: 256,
        leadId: lead.id,
      });

      const parsed = parseClassifyJson(result.content);

      await supabase
        .from("leads")
        .update({
          cs_group: parsed.cs_group,
          ...(parsed.cs_city !== null ? { cs_city: parsed.cs_city } : {}),
          ...(parsed.cs_country !== null ? { cs_country: parsed.cs_country } : {}),
        } as Record<string, unknown>)
        .eq("id", lead.id);

      classified++;
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      // Incluir el nombre del lead para facilitar el diagnóstico
      const detail = `Lead "${String(lead.full_name ?? lead.id)}": ${cause}`;
      errors.push({ leadId: lead.id, message: detail });
      // Fallback conservador: NO_ESCRIBIR para no bloquear el loop
      await supabase
        .from("leads")
        .update({ cs_group: "NO_ESCRIBIR" } as Record<string, unknown>)
        .eq("id", lead.id);
      classified++;
    }
  }

  // ¿Quedan leads sin clasificar?
  const { count: remaining } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId)
    .is("cs_group", null);

  const done = (remaining ?? 0) === 0;

  if (done) {
    await supabase
      .from("batches")
      .update({ status: "fetching_market" } as Record<string, unknown>)
      .eq("id", batchId);
  }

  return NextResponse.json({
    classified,
    total: batch.lead_count as number,
    remaining: remaining ?? 0,
    done,
    errors,
  });
}
