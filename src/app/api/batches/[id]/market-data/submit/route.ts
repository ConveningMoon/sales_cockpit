import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getMarketDataPrompt } from "@/lib/ai/prompts";
import { submitMarketDataBatch } from "@/lib/ai/batch";
import {
  getUniqueGeos,
  isGeoCached,
  buildMarketUserMessage,
  advanceToGenerating,
  markBatchError,
  geoLabel,
} from "@/lib/ai/market-data";

// Submit es rápido (solo crea el job en Anthropic) — no espera al modelo.
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params;
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, status, market_batch_id")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch no encontrado.", stage: "market_data_submit" }, { status: 404 });
  }
  if (batch.status !== "fetching_market") {
    return NextResponse.json(
      {
        error: `El batch está en estado "${batch.status}", se esperaba "fetching_market".`,
        stage: "market_data_submit",
        context: { batchStatus: batch.status },
      },
      { status: 409 },
    );
  }

  // Idempotencia: si ya hay un job activo, el cliente debe hacer poll.
  if (batch.market_batch_id) {
    return NextResponse.json({ alreadySubmitted: true, marketBatchId: batch.market_batch_id });
  }

  let uniqueGeos;
  try {
    uniqueGeos = await getUniqueGeos(supabase, batchId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await markBatchError(supabase, batchId, msg);
    return NextResponse.json({ error: msg, stage: "market_data_submit" }, { status: 500 });
  }

  const total = uniqueGeos.length;

  // Filtrar geografías ya cacheadas (no expiradas)
  const uncached = [];
  for (const geo of uniqueGeos) {
    if (!(await isGeoCached(supabase, geo))) uncached.push(geo);
  }

  // Si no hay nada que buscar → avanzar directo a generación
  if (uncached.length === 0) {
    await advanceToGenerating(supabase, batchId);
    console.log(`[market-data/submit] batch=${batchId} — 0 geos pendientes (todas cacheadas o sin leads A/B), avanzando a generating`);
    return NextResponse.json({ done: true, submitted: 0, cached: total, total });
  }

  // Enviar un batch con una request por geografía no cacheada
  const { system, userTemplate } = getMarketDataPrompt();
  let marketBatchId: string;
  try {
    marketBatchId = await submitMarketDataBatch({
      geos: uncached,
      system,
      buildUserMessage: (geo) => buildMarketUserMessage(userTemplate, geo),
    });
  } catch (err) {
    const msg = `Error al enviar el batch de market data a Anthropic: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[market-data/submit] batch=${batchId} — ${msg}`);
    await markBatchError(supabase, batchId, msg);
    return NextResponse.json({ error: msg, stage: "market_data_submit" }, { status: 500 });
  }

  // Guardar el id del job + el mapeo posicional de geografías (custom_id geo_<i>)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("batches") as any)
    .update({ market_batch_id: marketBatchId, market_batch_geos: uncached })
    .eq("id", batchId);

  console.log(
    `[market-data/submit] batch=${batchId} job=${marketBatchId} — enviadas ${uncached.length} geo` +
    `${uncached.length !== 1 ? "s" : ""} (${uncached.map(geoLabel).join("; ")}), ${total - uncached.length} en caché`,
  );

  return NextResponse.json({
    submitted: uncached.length,
    cached: total - uncached.length,
    total,
    marketBatchId,
  });
}
