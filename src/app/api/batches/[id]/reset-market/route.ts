import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const maxDuration = 30;

// Permite reintentar market data cuando el batch quedó en "error".
// Resetea el estado a "fetching_market" y limpia el job anterior y el mensaje de error.
// La clasificación ya está hecha (cs_group en los leads); no es necesario volver a clasificar.
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
  if (batch.status !== "error") {
    return NextResponse.json(
      { error: `El batch está en estado "${batch.status}", solo se puede reintentar desde "error".` },
      { status: 409 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("batches") as any)
    .update({
      status: "fetching_market",
      error_message: null,
      market_batch_id: null,
      market_batch_geos: null,
    })
    .eq("id", batchId);

  if (error) {
    return NextResponse.json({ error: `Error al resetear el batch: ${error.message}` }, { status: 500 });
  }

  console.log(`[reset-market] batch=${batchId} — resetado a fetching_market`);
  return NextResponse.json({ ok: true });
}
