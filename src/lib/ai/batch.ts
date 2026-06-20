import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Wrappers de la Message Batches API de Anthropic para market data async.
// El job se procesa fuera del request de Vercel → sin FUNCTION_INVOCATION_TIMEOUT.
// ---------------------------------------------------------------------------

export const MARKET_DATA_MODEL = "claude-sonnet-4-6";
export const OUTREACH_MODEL = "claude-sonnet-4-6";
const OUTREACH_MAX_TOKENS = 2000;
const WEB_SEARCH_MAX_USES = 4;
// Con los campos acotados el JSON es chico; 3000 da margen de sobra y elimina la
// truncación que cortaba el JSON a mitad de string (vista en Perú y otras geos).
const MAX_TOKENS = 3000;

export interface MarketGeo {
  country: string;
  city: string | null;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("[batch] ANTHROPIC_API_KEY no está definida en el entorno.");
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// El custom_id mapea posicionalmente a la geografía vía market_batch_geos.
export function geoCustomId(index: number): string {
  return `geo_${index}`;
}
export function customIdToIndex(customId: string): number {
  const m = customId.match(/^geo_(\d+)$/);
  return m ? parseInt(m[1], 10) : -1;
}

// Envía un batch con una request Messages por geografía. Devuelve el id del job.
export async function submitMarketDataBatch(params: {
  geos: MarketGeo[];
  system: string;
  buildUserMessage: (geo: MarketGeo) => string;
}): Promise<string> {
  const client = getClient();

  // web_search_20260209 es un tool nativo sin input_schema — cast necesario.
  const tools = [
    { type: "web_search_20260209", name: "web_search", max_uses: WEB_SEARCH_MAX_USES },
  ] as unknown as Anthropic.Messages.Tool[];

  const requests = params.geos.map((geo, i) => ({
    custom_id: geoCustomId(i),
    params: {
      model: MARKET_DATA_MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: "text" as const, text: params.system, cache_control: { type: "ephemeral" as const } },
      ],
      messages: [{ role: "user" as const, content: params.buildUserMessage(geo) }],
      tools,
    },
  }));

  const batch = await client.messages.batches.create({ requests });
  return batch.id;
}

export interface BatchProgress {
  processingStatus: "in_progress" | "canceling" | "ended";
  counts: {
    succeeded: number;
    errored: number;
    expired: number;
    canceled: number;
    processing: number;
  };
}

export async function retrieveBatchProgress(batchId: string): Promise<BatchProgress> {
  const client = getClient();
  const b = await client.messages.batches.retrieve(batchId);
  return {
    processingStatus: b.processing_status,
    counts: b.request_counts,
  };
}

export interface GeoResult {
  index: number;          // del custom_id geo_<i>
  ok: boolean;
  content?: string;       // texto del mensaje si succeeded
  stopReason?: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  webSearchRequests: number;
  errorDetail?: string;   // si no ok
}

// ---------------------------------------------------------------------------
// Outreach sequences
// ---------------------------------------------------------------------------

export interface OutreachLeadInput {
  leadId: string;
  userMessage: string;
}

// custom_id = "lead_<uuid>" — permite extraer el lead_id directo sin tabla posicional.
export async function submitOutreachBatch(params: {
  leads: OutreachLeadInput[];
  system: string;
}): Promise<string> {
  const client = getClient();

  const requests = params.leads.map(({ leadId, userMessage }) => ({
    custom_id: `lead_${leadId}`,
    params: {
      model: OUTREACH_MODEL,
      max_tokens: OUTREACH_MAX_TOKENS,
      system: [
        { type: "text" as const, text: params.system, cache_control: { type: "ephemeral" as const } },
      ],
      messages: [{ role: "user" as const, content: userMessage }],
    },
  }));

  const batch = await client.messages.batches.create({ requests });
  return batch.id;
}

export interface OutreachResult {
  leadId: string;
  ok: boolean;
  content?: string;
  stopReason?: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  errorDetail?: string;
}

// Itera los resultados de un batch de outreach (JSONL). El leadId se extrae del custom_id.
export async function* iterateOutreachResults(batchId: string): AsyncGenerator<OutreachResult> {
  const client = getClient();
  const decoder = await client.messages.batches.results(batchId);

  for await (const entry of decoder) {
    const leadId = entry.custom_id.replace(/^lead_/, "");
    const r = entry.result;

    if (r.type === "succeeded") {
      const msg = r.message;
      const content = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const usage = msg.usage as Anthropic.Usage & { cache_read_input_tokens?: number };
      yield {
        leadId,
        ok: true,
        content,
        stopReason: msg.stop_reason,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cachedTokens: usage.cache_read_input_tokens ?? 0,
      };
    } else if (r.type === "errored") {
      yield {
        leadId, ok: false,
        inputTokens: 0, outputTokens: 0, cachedTokens: 0,
        errorDetail: `Error de Anthropic: ${JSON.stringify(r.error)}`,
      };
    } else {
      yield {
        leadId, ok: false,
        inputTokens: 0, outputTokens: 0, cachedTokens: 0,
        errorDetail: `Resultado "${r.type}" (el lead no se procesó).`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Market data results (iteración genérica del JSONL)
// ---------------------------------------------------------------------------

// Itera los resultados del batch (JSONL). Cada entrada mapea a una geografía.
export async function* iterateMarketResults(batchId: string): AsyncGenerator<GeoResult> {
  const client = getClient();
  const decoder = await client.messages.batches.results(batchId);

  for await (const entry of decoder) {
    const index = customIdToIndex(entry.custom_id);
    const r = entry.result;

    if (r.type === "succeeded") {
      const msg = r.message;
      const content = msg.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const usage = msg.usage as Anthropic.Usage & {
        cache_read_input_tokens?: number;
        server_tool_use?: { web_search_requests?: number };
      };
      yield {
        index,
        ok: true,
        content,
        stopReason: msg.stop_reason,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cachedTokens: usage.cache_read_input_tokens ?? 0,
        webSearchRequests: usage.server_tool_use?.web_search_requests ?? 0,
      };
    } else if (r.type === "errored") {
      yield {
        index,
        ok: false,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        webSearchRequests: 0,
        errorDetail: `Error de Anthropic: ${JSON.stringify(r.error)}`,
      };
    } else {
      // canceled | expired
      yield {
        index,
        ok: false,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        webSearchRequests: 0,
        errorDetail: `Resultado "${r.type}" (la geografía no se procesó).`,
      };
    }
  }
}
