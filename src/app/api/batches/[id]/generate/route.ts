import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { submitOutreachBatch, OUTREACH_MODEL } from "@/lib/ai/batch";
import { getOutreachSequencePrompt, buildOutreachUserMessage } from "@/lib/ai/prompts";
import { getMarketParagraph } from "@/lib/ai/market-data";

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
    .select("id, status, outreach_batch_id")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch no encontrado.", stage: "generate" }, { status: 404 });
  }
  if (batch.status !== "generating") {
    return NextResponse.json(
      {
        error: `El batch está en estado "${batch.status}", se esperaba "generating".`,
        stage: "generate",
        context: { batchStatus: batch.status },
      },
      { status: 409 },
    );
  }
  // Idempotencia: si ya hay un job activo el cliente debe hacer poll.
  if (batch.outreach_batch_id) {
    return NextResponse.json({ alreadySubmitted: true, outreachBatchId: batch.outreach_batch_id });
  }

  // Leads A/B del batch con sus campos de perfil
  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, full_name, headline, current_position, current_company, cs_city, cs_country, cs_group, summary")
    .eq("batch_id", batchId)
    .in("cs_group", ["A", "B"]);

  if (leadsError) {
    return NextResponse.json(
      { error: `Error al consultar leads del batch: ${leadsError.message}`, stage: "generate" },
      { status: 500 },
    );
  }
  if (!leads || leads.length === 0) {
    // Sin leads A/B — avanzar directamente a done
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("batches") as any).update({ status: "done" }).eq("id", batchId);
    console.log(`[generate] batch=${batchId} — 0 leads A/B, avanzando a done`);
    return NextResponse.json({ submitted: 0, noMarketDataCount: 0, done: true });
  }

  // Deduplicar geos para hacer N queries en vez de leads.length queries
  const geoKeyMap = new Map<string, { paragraph: string; found: boolean }>();
  for (const lead of leads) {
    const key = `${lead.cs_country ?? ""}|${lead.cs_city ?? ""}`;
    if (!geoKeyMap.has(key)) {
      const result = await getMarketParagraph(supabase, {
        country: lead.cs_country as string | null,
        city: lead.cs_city as string | null,
      });
      geoKeyMap.set(key, result);
    }
  }

  const { system, userTemplate } = getOutreachSequencePrompt();

  let noMarketDataCount = 0;
  const leadsWithMessages = leads.map((lead) => {
    const key = `${lead.cs_country ?? ""}|${lead.cs_city ?? ""}`;
    const geo = geoKeyMap.get(key) ?? { paragraph: "", found: false };
    // Solo grupo A debería usar market_paragraph; para B el prompt ya lo ignora.
    // Contamos degradación solo en A (para B es intencional no tener dato).
    if (lead.cs_group === "A" && !geo.found) noMarketDataCount++;
    return {
      leadId: lead.id as string,
      userMessage: buildOutreachUserMessage(
        userTemplate,
        {
          full_name: lead.full_name as string | null,
          headline: lead.headline as string | null,
          current_position: lead.current_position as string | null,
          current_company: lead.current_company as string | null,
          cs_city: lead.cs_city as string | null,
          cs_country: lead.cs_country as string | null,
          cs_group: lead.cs_group as string | null,
          summary: lead.summary as string | null,
        },
        geo.paragraph,
      ),
    };
  });

  let outreachBatchId: string;
  try {
    outreachBatchId = await submitOutreachBatch({ leads: leadsWithMessages, system });
  } catch (err) {
    const msg = `Error al enviar el batch de secuencias a Anthropic: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[generate] batch=${batchId} — ${msg}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("batches") as any)
      .update({ status: "error", error_message: msg })
      .eq("id", batchId);
    return NextResponse.json({ error: msg, stage: "generate" }, { status: 500 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("batches") as any)
    .update({ outreach_batch_id: outreachBatchId })
    .eq("id", batchId);

  const modelLabel = OUTREACH_MODEL;
  console.log(
    `[generate] batch=${batchId} job=${outreachBatchId} — enviados ${leads.length} lead${leads.length !== 1 ? "s" : ""} ` +
    `(${noMarketDataCount} grupo A sin datos de mercado) modelo=${modelLabel}`,
  );

  return NextResponse.json({
    submitted: leads.length,
    noMarketDataCount,
    outreachBatchId,
  });
}
