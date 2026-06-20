import { createServerClient } from "@/lib/supabase/server";
import { extractJsonObject } from "@/lib/ai/prompts";
import type { MarketGeo } from "@/lib/ai/batch";

// ---------------------------------------------------------------------------
// Helpers compartidos por los endpoints submit + poll de market data.
// ---------------------------------------------------------------------------

type Supabase = ReturnType<typeof createServerClient>;

export const MARKET_DATA_TTL_DAYS = 30;

export interface MarketDataParsed {
  price_sqm: string;
  sale_velocity: string;
  buyer_profile: string;
  demand_level: string;
  market_paragraph: string;
  source_note: string;
}

export function parseMarketDataJson(raw: string): MarketDataParsed {
  const text = extractJsonObject(raw);
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

export function buildMarketUserMessage(template: string, geo: MarketGeo): string {
  return template
    .replace("{country}", geo.country)
    .replace("{city}", geo.city ?? "(sin ciudad — usar nivel país)");
}

export function geoLabel(geo: MarketGeo): string {
  return [geo.city, geo.country].filter(Boolean).join(", ");
}

// Geografías únicas (orden de aparición) de leads A/B con cs_country no nulo.
export async function getUniqueGeos(
  supabase: Supabase,
  batchId: string,
): Promise<MarketGeo[]> {
  const { data: leadGeos, error } = await supabase
    .from("leads")
    .select("cs_country, cs_city")
    .eq("batch_id", batchId)
    .in("cs_group", ["A", "B"])
    .not("cs_country", "is", null);

  if (error) throw new Error(`Error al consultar geografías del batch: ${error.message}`);

  const seen = new Set<string>();
  const out: MarketGeo[] = [];
  for (const g of leadGeos ?? []) {
    const key = `${g.cs_country}|${g.cs_city ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ country: g.cs_country as string, city: g.cs_city as string | null });
    }
  }
  return out;
}

export async function isGeoCached(supabase: Supabase, geo: MarketGeo): Promise<boolean> {
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

export async function upsertMarketData(
  supabase: Supabase,
  geo: MarketGeo,
  parsed: MarketDataParsed,
  model: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + MARKET_DATA_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("market_data") as any).upsert(
    {
      country: geo.country,
      city: geo.city,
      stat: parsed.price_sqm,         // columna legacy NOT NULL
      common_problem: parsed.demand_level,
      price_sqm: parsed.price_sqm,
      sale_velocity: parsed.sale_velocity,
      buyer_profile: parsed.buyer_profile,
      demand_level: parsed.demand_level,
      market_paragraph: parsed.market_paragraph,
      source_note: parsed.source_note,
      model,
      expires_at: expiresAt,
    },
    { onConflict: "country,city" },
  );
  if (error) throw new Error(`Error al guardar en base de datos: ${error.message}`);
}

export async function markBatchError(
  supabase: Supabase,
  batchId: string,
  errorMessage: string,
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("batches") as any)
    .update({ status: "error", error_message: errorMessage })
    .eq("id", batchId);
}

export async function advanceToGenerating(supabase: Supabase, batchId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("batches") as any)
    .update({ status: "generating", market_batch_id: null, market_batch_geos: null })
    .eq("id", batchId);
}
