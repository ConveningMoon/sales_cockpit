import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { recordAiUsage } from "@/lib/ai/router";
import { getModel } from "@/lib/ai/models";
import {
  retrieveBatchProgress,
  iterateMarketResults,
  MARKET_DATA_MODEL,
  type MarketGeo,
} from "@/lib/ai/batch";
import {
  parseMarketDataJson,
  upsertMarketData,
  advanceToGenerating,
  markBatchError,
  geoLabel,
} from "@/lib/ai/market-data";

// Poll recupera estado/resultados — rápido, no espera al modelo.
export const maxDuration = 60;

// La Batch API descuenta 50% sobre tokens. Web search se cobra aparte; aplicamos
// la tarifa estándar ($0.01/búsqueda) de forma conservadora.
const BATCH_TOKEN_DISCOUNT = 0.5;
const WEB_SEARCH_COST_USD = 0.01;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params;
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, status, market_batch_id, market_batch_geos")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch no encontrado.", stage: "market_data_poll" }, { status: 404 });
  }
  if (batch.status !== "fetching_market") {
    return NextResponse.json(
      {
        error: `El batch está en estado "${batch.status}", se esperaba "fetching_market".`,
        stage: "market_data_poll",
        context: { batchStatus: batch.status },
      },
      { status: 409 },
    );
  }
  if (!batch.market_batch_id) {
    return NextResponse.json(
      { error: "No hay un job de market data activo. Envía el batch primero.", stage: "market_data_poll" },
      { status: 409 },
    );
  }

  const jobId = batch.market_batch_id as string;
  const geos = (batch.market_batch_geos as MarketGeo[] | null) ?? [];

  // Estado del job en Anthropic
  let progress;
  try {
    progress = await retrieveBatchProgress(jobId);
  } catch (err) {
    const msg = `Error al consultar el estado del batch en Anthropic: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[market-data/poll] batch=${batchId} job=${jobId} — ${msg}`);
    return NextResponse.json({ error: msg, stage: "market_data_poll" }, { status: 500 });
  }

  if (progress.processingStatus !== "ended") {
    return NextResponse.json({
      status: "in_progress",
      counts: progress.counts,
      total: geos.length,
    });
  }

  // Job terminado → recuperar e ingerir resultados
  const model = getModel(MARKET_DATA_MODEL);
  let succeeded = 0;
  const errors: { geography: string; detail: string }[] = [];

  try {
    for await (const r of iterateMarketResults(jobId)) {
      const geo = geos[r.index];
      const label = geo ? geoLabel(geo) : `(custom_id desconocido idx=${r.index})`;

      const tokenCost =
        (r.inputTokens * model.costPerInputToken +
          r.outputTokens * model.costPerOutputToken +
          r.cachedTokens * model.costPerCacheReadToken) *
        BATCH_TOKEN_DISCOUNT;
      const costUsd = tokenCost + r.webSearchRequests * WEB_SEARCH_COST_USD;
      const baseUsage = {
        taskType: "market_data" as const,
        model: MARKET_DATA_MODEL,
        provider: "anthropic",
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cachedTokens: r.cachedTokens,
        costUsd,
        context: { batch_id: batchId, geography: label, via: "batch_api", custom_id: `geo_${r.index}` },
      };

      if (!geo) {
        errors.push({ geography: label, detail: "Resultado sin geografía mapeable." });
        continue;
      }

      // Resultado fallido del batch (errored/expired/canceled)
      if (!r.ok) {
        const detail = r.errorDetail ?? "Error desconocido.";
        errors.push({ geography: label, detail });
        await recordAiUsage({ ...baseUsage, status: "error", errorDetail: detail }).catch(() => {});
        console.error(`[market-data/poll] batch=${batchId} geo="${label}" — FALLO: ${detail}`);
        continue;
      }

      // pause_turn = el turno no terminó (raro con max_uses acotado)
      if (r.stopReason === "pause_turn") {
        const detail = `La búsqueda no terminó (stop_reason=pause_turn). Reintentar la geografía.`;
        errors.push({ geography: label, detail });
        await recordAiUsage({ ...baseUsage, status: "error", errorDetail: detail }).catch(() => {});
        console.error(`[market-data/poll] batch=${batchId} geo="${label}" — pause_turn`);
        continue;
      }

      // Parsear + guardar
      try {
        const parsed = parseMarketDataJson(r.content ?? "");
        await upsertMarketData(supabase, geo, parsed, MARKET_DATA_MODEL);
        await recordAiUsage({ ...baseUsage, status: "ok" }).catch(() => {});
        succeeded++;
        console.log(`[market-data/poll] batch=${batchId} geo="${label}" — OK (in=${r.inputTokens} out=${r.outputTokens} searches=${r.webSearchRequests})`);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        const snippet = (r.content ?? "").trim() ? ` Respuesta: "${(r.content ?? "").slice(0, 300)}"` : "";
        const detail = `${cause}.${snippet}`;
        errors.push({ geography: label, detail });
        await recordAiUsage({ ...baseUsage, status: "error", errorDetail: detail }).catch(() => {});
        console.error(`[market-data/poll] batch=${batchId} geo="${label}" — parseo/guardado: ${detail}`);
      }
    }
  } catch (err) {
    const msg = `Error al recuperar los resultados del batch: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[market-data/poll] batch=${batchId} job=${jobId} — ${msg}`);
    return NextResponse.json({ error: msg, stage: "market_data_poll" }, { status: 500 });
  }

  // Todas fallaron → estado de error con detalle verbatim
  if (succeeded === 0) {
    const detail = errors.map((e) => `"${e.geography}": ${e.detail}`).join(" | ") || "Ninguna geografía se procesó.";
    await markBatchError(supabase, batchId, detail);
    return NextResponse.json(
      { status: "ended", done: false, processed: 0, failed: errors.length, errors, error: detail, stage: "market_data_poll" },
      { status: 500 },
    );
  }

  // Éxito (total o parcial) → avanzar a generación; los fallos parciales se reportan
  await advanceToGenerating(supabase, batchId);
  console.log(`[market-data/poll] batch=${batchId} — ENDED: ${succeeded} ok, ${errors.length} con error → generating`);

  return NextResponse.json({
    status: "ended",
    done: true,
    processed: succeeded,
    failed: errors.length,
    errors,
    total: geos.length,
  });
}
