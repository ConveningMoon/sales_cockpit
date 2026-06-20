import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { callAI } from "@/lib/ai/router";
import { getMarketDataPrompt, cleanJsonOutput } from "@/lib/ai/prompts";

export const maxDuration = 60;

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
      throw new Error(`Campo requerido ausente o vacío en respuesta de market data: ${key}`);
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

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: batchId } = await params;
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, status")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch no encontrado." }, { status: 404 });
  }
  if (batch.status !== "fetching_market") {
    return NextResponse.json(
      { error: `El batch está en estado "${batch.status}", se esperaba "fetching_market".` },
      { status: 409 }
    );
  }

  // Geografías únicas de leads A o B en este batch con cs_country no nulo
  const { data: leadGeos } = await supabase
    .from("leads")
    .select("cs_country, cs_city")
    .eq("batch_id", batchId)
    .in("cs_group", ["A", "B"])
    .not("cs_country", "is", null);

  if (!leadGeos || leadGeos.length === 0) {
    // Sin leads A/B con geografía — avanzar directamente
    await supabase
      .from("batches")
      .update({ status: "generating" } as Record<string, unknown>)
      .eq("id", batchId);
    return NextResponse.json({ done: true, total: 0, processed: 0, cached: 0 });
  }

  // Deduplicar geografías
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

  // Encontrar la primera geografía SIN market_data válido (no expirado)
  let target: { country: string; city: string | null } | null = null;

  for (const geo of uniqueGeos) {
    let q = supabase
      .from("market_data")
      .select("id")
      .eq("country", geo.country)
      .or("expires_at.is.null,expires_at.gt.now()");
    // Supabase .is() solo acepta null/boolean — usar eq o is según valor
    q = geo.city !== null
      ? (q.eq("city", geo.city) as typeof q)
      : (q.is("city", null) as typeof q);
    const { data: cached } = await q.maybeSingle();

    if (!cached) {
      target = geo;
      break;
    }
  }

  // Si todas tienen cache válido → pipeline listo para generación
  if (!target) {
    await supabase
      .from("batches")
      .update({ status: "generating" } as Record<string, unknown>)
      .eq("id", batchId);
    return NextResponse.json({ done: true, total, processed: 0, cached: total });
  }

  // Generar market data para la geografía target
  const { system, userTemplate } = getMarketDataPrompt();
  const userMessage = buildMarketUserMessage(userTemplate, target.country, target.city);

  try {
    const result = await callAI({
      taskType: "market_data",
      systemPrompt: system,
      userMessage,
      maxTokens: 1024,
      webSearch: true,
    });

    const parsed = parseMarketDataJson(result.content);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("market_data") as any)
      .upsert(
        {
          country: target.country,
          city: target.city,
          stat: parsed.price_sqm,            // compat con columnas legacy (NOT NULL)
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
        { onConflict: "country,city" }
      );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Error generando market data para ${target.country}/${target.city ?? "país"}: ${msg}` }, { status: 500 });
  }

  // Contar cuántas quedan sin cache ahora
  let remaining = 0;
  for (const geo of uniqueGeos) {
    let q2 = supabase
      .from("market_data")
      .select("id")
      .eq("country", geo.country)
      .or("expires_at.is.null,expires_at.gt.now()");
    q2 = geo.city !== null
      ? (q2.eq("city", geo.city) as typeof q2)
      : (q2.is("city", null) as typeof q2);
    const { data: cached } = await q2.maybeSingle();
    if (!cached) remaining++;
  }

  const done = remaining === 0;
  if (done) {
    await supabase
      .from("batches")
      .update({ status: "generating" } as Record<string, unknown>)
      .eq("id", batchId);
  }

  return NextResponse.json({
    done,
    total,
    processed: 1,
    cached: total - remaining - 1,
    remaining,
    country: target.country,
    city: target.city,
  });
}
