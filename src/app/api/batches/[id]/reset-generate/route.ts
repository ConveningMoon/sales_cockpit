import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 30;

// Permite reintentar la generación cuando el batch quedó en "error" o en
// "fetching_market" (estado heredado de batches anteriores al stage de market-data).
// Resetea el estado a "generating" y limpia el job anterior y el mensaje de error.
// La clasificación ya está hecha (cs_group en los leads); no hace falta reclasificar.
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
    return NextResponse.json({ error: "Batch no encontrado." }, { status: 404 });
  }
  if (batch.status !== "error" && batch.status !== "fetching_market") {
    return NextResponse.json(
      { error: `El batch está en estado "${batch.status}", solo se puede reintentar desde "error" o "fetching_market".` },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("batches") as any)
    .update({
      status: "generating",
      error_message: null,
      outreach_batch_id: null,
      market_batch_id: null,
      market_batch_geos: null,
    })
    .eq("id", batchId);

  if (error) {
    return NextResponse.json({ error: `Error al resetear el batch: ${error.message}` }, { status: 500 });
  }

  console.log(`[reset-generate] batch=${batchId} — resetado a generating`);
  return NextResponse.json({ ok: true });
}
