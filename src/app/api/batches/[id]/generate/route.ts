import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { submitOutreachBatch, OUTREACH_MODEL } from "@/lib/ai/batch";
import { getOutreachSequencePrompt, buildOutreachUserMessage } from "@/lib/ai/prompts";

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
    return NextResponse.json({ submitted: 0, done: true });
  }

  // Filtrar leads que ya tienen secuencias (idempotencia para add-leads)
  const allAbIds = leads.map((l) => l.id as string);
  const { data: existingSeqs } = await supabase
    .from("outreach_sequence")
    .select("lead_id")
    .in("lead_id", allAbIds);
  const generatedIds = new Set((existingSeqs ?? []).map((s) => s.lead_id as string));
  const newLeads = leads.filter((l) => !generatedIds.has(l.id as string));

  if (newLeads.length === 0) {
    // Todos ya tienen secuencias — avanzar a done
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("batches") as any).update({ status: "done" }).eq("id", batchId);
    console.log(`[generate] batch=${batchId} — todos los leads A/B ya tienen secuencias, avanzando a done`);
    return NextResponse.json({ submitted: 0, done: true });
  }

  const { system, userTemplate } = getOutreachSequencePrompt();

  const leadsWithMessages = newLeads.map((lead) => ({
    leadId: lead.id as string,
    userMessage: buildOutreachUserMessage(userTemplate, {
      full_name: lead.full_name as string | null,
      headline: lead.headline as string | null,
      current_position: lead.current_position as string | null,
      current_company: lead.current_company as string | null,
      cs_city: lead.cs_city as string | null,
      cs_country: lead.cs_country as string | null,
      cs_group: lead.cs_group as string | null,
      summary: lead.summary as string | null,
    }),
  }));

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

  console.log(
    `[generate] batch=${batchId} job=${outreachBatchId} — enviados ${newLeads.length} lead${newLeads.length !== 1 ? "s" : ""} modelo=${OUTREACH_MODEL}`,
  );

  return NextResponse.json({
    submitted: newLeads.length,
    outreachBatchId,
  });
}
