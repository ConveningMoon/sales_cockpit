import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai/router";
import { getMarketDataPrompt, cleanJsonOutput } from "@/lib/ai/prompts";

export const maxDuration = 60;

// Máximo de búsquedas web por geografía — acota latencia y costo por llamada.
const WEB_SEARCH_MAX_USES = 4;

interface MarketDataResult {
  price_sqm: string;
  sale_velocity: string;
  buyer_profile: string;
  demand_level: string;
  market_paragraph: string;
  source_note: string;
}

function parseMarketDataJson(raw: string): MarketDataResult {
  const text = cleanJsonOutput(raw);
  const data = JSON.parse(text) as Record<string, unknown>;

  const required = ["price_sqm", "sale_velocity", "buyer_profile", "demand_level", "market_paragraph"];
  for (const key of required) {
    if (typeof data[key] !== "string" || !data[key]) {
      throw new Error(`Campo requerido ausente o vacío en respuesta de IA: "${key}"`);
    }
  }

  return {
    price_sqm: data.price_sqm as string,
    sale_velocity: data.sale_velocity as string,
    buyer_profile: data.buyer_profile as string,
    demand_level: data.demand_level as string,
    market_paragraph: data.market_paragraph as string,
    source_note: typeof data.source_note === "string" ? data.source_note : "",
  };
}

function buildMarketUserMessage(template: string, country: string, city: string | null): string {
  return template
    .replace("{country}", country)
    .replace("{city}", city ?? "(sin ciudad — usar nivel país)");
}

type Supabase = ReturnType<typeof createServerClient>;

async function isGeoCached(
  supabase: Supabase,
  geo: { country: string; city: string | null },
): Promise<boolean> {
  let q = supabase
    .from("market_data")
    .select("id")
    .eq("country", geo.country)
    .or("expires_at.is.null,expires_at.gt.now()");
  q = geo.city !== null
    ? (q.eq("city", geo.city) as typeof q)
    : (q.is("city", null) as typeof q);
  const { data } = await q.maybeSingle();
  return data !== null;
}

async function markBatchError(
  supabase: Supabase,
  batchId: string,
  errorMessage: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("batches") as any)
    .update({ status: "error", error_message: errorMessage })
    .eq("id", batchId);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params;
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, status")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json(
      { error: "Batch no encontrado.", stage: "market_data" },
      { status: 404 },
    );
  }
  if (batch.status !== "fetching_market") {
    return NextResponse.json(
      {
        error: `El batch está en estado "${batch.status}", se esperaba "fetching_market".`,
        stage: "market_data",
        context: { batchStatus: batch.status },
      },
      { status: 409 },
    );
  }

  // Geografías únicas de leads A o B con cs_country no nulo
  const { data: leadGeos, error: geoError } = await supabase
    .from("leads")
    .select("cs_country, cs_city")
    .eq("batch_id", batchId)
    .in("cs_group", ["A", "B"])
    .not("cs_country", "is", null);

  if (geoError) {
    const msg = `Error al consultar geografías del batch: ${geoError.message}`;
    await markBatchError(supabase, batchId, msg);
    return NextResponse.json({ error: msg, stage: "market_data" }, { status: 500 });
  }

  if (!leadGeos || leadGeos.length === 0) {
    // Sin leads A/B con geografía — avanzar directamente a generating
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("batches") as any)
      .update({ status: "generating" })
      .eq("id", batchId);
    return NextResponse.json({ done: true, total: 0, remaining: 0, country: null, city: null });
  }

  // Deduplicar geografías manteniendo orden de aparición
  const seen = new Set<string>();
  const uniqueGeos: { country: string; city: string | null }[] = [];
  for (const g of leadGeos) {
    const key = `${g.cs_country}|${g.cs_city ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueGeos.push({ country: g.cs_country as string, city: g.cs_city as string | null });
    }
  }

  const total = uniqueGeos.length;

  // Pasada única: encontrar la primera geo sin caché + contar cuántas quedan pendientes.
  // Elimina la segunda pasada de N queries que tenía la versión anterior.
  let target: { country: string; city: string | null } | null = null;
  let pendingCount = 0;

  for (const geo of uniqueGeos) {
    const cached = await isGeoCached(supabase, geo);
    if (!cached) {
      pendingCount++;
      if (!target) target = geo; // primera no cacheada = la que procesamos en este request
    }
  }

  if (!target) {
    // Todas las geos tienen caché válida → avanzar
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("batches") as any)
      .update({ status: "generating" })
      .eq("id", batchId);
    return NextResponse.json({ done: true, total, remaining: 0, country: null, city: null });
  }

  const geoLabel = [target.city, target.country].filter(Boolean).join(", ");
  console.log(`[market-data] batch=${batchId} geo="${geoLabel}" pending=${pendingCount} — llamando Sonnet+webSearch (max_uses=${WEB_SEARCH_MAX_USES})`);

  const { system, userTemplate } = getMarketDataPrompt();
  const userMessage = buildMarketUserMessage(userTemplate, target.country, target.city);

  let rawContent = "";
  let parsed: MarketDataResult;

  try {
    const result = await callAI({
      taskType: "market_data",
      systemPrompt: system,
      userMessage,
      maxTokens: 1024,
      webSearch: true,
      webSearchMaxUses: WEB_SEARCH_MAX_USES,
      context: { batch_id: batchId, country: target.country, city: target.city },
    });
    rawContent = result.content;
    parsed = parseMarketDataJson(rawContent);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    const snippet = rawContent.trim()
      ? ` Respuesta recibida: "${rawContent.slice(0, 300)}"`
      : "";
    const msg = `Geografía "${geoLabel}": ${cause}.${snippet}`;
    console.error(`[market-data] batch=${batchId} geo="${geoLabel}" — ERROR: ${msg}`);
    await markBatchError(supabase, batchId, msg);
    return NextResponse.json(
      { error: msg, stage: "market_data", context: { country: target.country, city: target.city } },
      { status: 500 },
    );
  }

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("market_data") as any).upsert(
      {
        country: target.country,
        city: target.city,
        stat: parsed.price_sqm,         // columna legacy NOT NULL
        common_problem: parsed.demand_level,
        price_sqm: parsed.price_sqm,
        sale_velocity: parsed.sale_velocity,
        buyer_profile: parsed.buyer_profile,
        demand_level: parsed.demand_level,
        market_paragraph: parsed.market_paragraph,
        source_note: parsed.source_note,
        model: "claude-sonnet-4-6",
        expires_at: expiresAt,
      },
      { onConflict: "country,city" },
    );
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    const msg = `Geografía "${geoLabel}": error al guardar en base de datos: ${cause}`;
    await markBatchError(supabase, batchId, msg);
    return NextResponse.json(
      { error: msg, stage: "market_data", context: { country: target.country, city: target.city } },
      { status: 500 },
    );
  }

  // remaining = pendingCount - 1 (acabamos de procesar target)
  const remaining = pendingCount - 1;
  const done = remaining === 0;
  console.log(`[market-data] batch=${batchId} geo="${geoLabel}" — OK upsert en market_data, remaining=${remaining}`);

  if (done) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("batches") as any)
      .update({ status: "generating" })
      .eq("id", batchId);
  }

  return NextResponse.json({ done, total, remaining, country: target.country, city: target.city });
}
