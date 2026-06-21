import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { recordAiUsage } from "@/lib/ai/router";
import { getModel } from "@/lib/ai/models";
import {
  retrieveBatchProgress,
  iterateOutreachResults,
  OUTREACH_MODEL,
} from "@/lib/ai/batch";
import { extractJsonObject } from "@/lib/ai/prompts";

// Poll recupera estado/resultados — rápido, no espera al modelo.
export const maxDuration = 60;

// Batch API: 50% de descuento sobre tokens.
const BATCH_TOKEN_DISCOUNT = 0.5;

interface OutreachMessages {
  cold: string;
  fu1: string;
  fu2: string;
}

function parseOutreachJson(raw: string): OutreachMessages {
  const text = extractJsonObject(raw);
  const data = JSON.parse(text) as Record<string, unknown>;
  for (const key of ["cold", "fu1", "fu2"]) {
    if (typeof data[key] !== "string" || !data[key]) {
      throw new Error(`Campo requerido ausente o vacío en respuesta de IA: "${key}"`);
    }
  }
  return { cold: data.cold as string, fu1: data.fu1 as string, fu2: data.fu2 as string };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params;
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, status, outreach_batch_id")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch no encontrado.", stage: "generate_poll" }, { status: 404 });
  }
  if (batch.status !== "generating") {
    return NextResponse.json(
      {
        error: `El batch está en estado "${batch.status}", se esperaba "generating".`,
        stage: "generate_poll",
        context: { batchStatus: batch.status },
      },
      { status: 409 },
    );
  }
  if (!batch.outreach_batch_id) {
    return NextResponse.json(
      { error: "No hay un job de generación activo. Envía el batch primero.", stage: "generate_poll" },
      { status: 409 },
    );
  }

  const jobId = batch.outreach_batch_id as string;

  let progress;
  try {
    progress = await retrieveBatchProgress(jobId);
  } catch (err) {
    const msg = `Error al consultar el estado del job en Anthropic: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[generate/poll] batch=${batchId} job=${jobId} — ${msg}`);
    return NextResponse.json({ error: msg, stage: "generate_poll" }, { status: 500 });
  }

  if (progress.processingStatus !== "ended") {
    return NextResponse.json({ status: "in_progress", counts: progress.counts });
  }

  const model = getModel(OUTREACH_MODEL);
  let succeeded = 0;
  const errors: { leadId: string; detail: string }[] = [];

  try {
    for await (const r of iterateOutreachResults(jobId)) {
      const { leadId } = r;

      const tokenCost =
        (r.inputTokens * model.costPerInputToken +
          r.outputTokens * model.costPerOutputToken +
          r.cachedTokens * model.costPerCacheReadToken) *
        BATCH_TOKEN_DISCOUNT;

      const baseUsage = {
        taskType: "outreach" as const,
        model: OUTREACH_MODEL,
        provider: "anthropic",
        leadId,
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cachedTokens: r.cachedTokens,
        costUsd: tokenCost,
        context: {
          batch_id: batchId,
          via: "batch_api",
        } as Record<string, unknown>,
      };

      if (!r.ok) {
        const detail = r.errorDetail ?? "Error desconocido.";
        errors.push({ leadId, detail });
        await recordAiUsage({ ...baseUsage, status: "error", errorDetail: detail }).catch(() => {});
        console.error(`[generate/poll] batch=${batchId} lead=${leadId} — FALLO: ${detail}`);
        continue;
      }

      try {
        const msgs = parseOutreachJson(r.content ?? "");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: upsertErr } = await (supabase.from("outreach_sequence") as any).upsert(
          [
            { lead_id: leadId, kind: "cold", body: msgs.cold, char_count: msgs.cold.length, model: OUTREACH_MODEL },
            { lead_id: leadId, kind: "fu1", body: msgs.fu1, char_count: msgs.fu1.length, model: OUTREACH_MODEL },
            { lead_id: leadId, kind: "fu2", body: msgs.fu2, char_count: msgs.fu2.length, model: OUTREACH_MODEL },
          ],
          { onConflict: "lead_id,kind" },
        );
        if (upsertErr) throw new Error(`DB upsert: ${upsertErr.message}`);
        await recordAiUsage({ ...baseUsage, status: "ok" }).catch(() => {});
        succeeded++;
        console.log(`[generate/poll] batch=${batchId} lead=${leadId} — OK (in=${r.inputTokens} out=${r.outputTokens})`);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        const snippet = (r.content ?? "").trim() ? ` Respuesta: "${(r.content ?? "").slice(0, 300)}"` : "";
        const detail = `${cause}.${snippet}`;
        errors.push({ leadId, detail });
        await recordAiUsage({ ...baseUsage, status: "error", errorDetail: detail }).catch(() => {});
        console.error(`[generate/poll] batch=${batchId} lead=${leadId} — parseo/guardado: ${detail}`);
      }
    }
  } catch (err) {
    const msg = `Error al recuperar los resultados del batch: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[generate/poll] batch=${batchId} job=${jobId} — ${msg}`);
    return NextResponse.json({ error: msg, stage: "generate_poll" }, { status: 500 });
  }

  if (succeeded === 0) {
    const detail = errors.map((e) => `lead ${e.leadId}: ${e.detail}`).join(" | ") || "Ningún lead se procesó.";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("batches") as any)
      .update({ status: "error", error_message: detail })
      .eq("id", batchId);
    return NextResponse.json(
      { status: "ended", done: false, processed: 0, failed: errors.length, errors, error: detail, stage: "generate_poll" },
      { status: 500 },
    );
  }

  // Avanzar a done — limpiar outreach_batch_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("batches") as any)
    .update({ status: "done", outreach_batch_id: null })
    .eq("id", batchId);

  console.log(`[generate/poll] batch=${batchId} — DONE: ${succeeded} ok, ${errors.length} con error`);

  return NextResponse.json({
    status: "ended",
    done: true,
    processed: succeeded,
    failed: errors.length,
    errors,
  });
}
