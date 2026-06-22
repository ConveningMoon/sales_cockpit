import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseLh2LeadRow, filterLh2Rows } from "@/lib/lh/parser";
import { upsertLead } from "@/lib/leads/ingest";

export const maxDuration = 60;

// POST /api/batches/[id]/add-leads
// Body: { rows: Record<string, string>[] }
// Importa leads nuevos al batch. Idempotente por lh_id.
// Si hay leads nuevos: avanza el batch a "classifying" para que el pipeline pueda continuar.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  if (!Array.isArray(b.rows) || b.rows.length === 0) {
    return NextResponse.json(
      { error: "El campo 'rows' es requerido y debe ser un array no vacío." },
      { status: 400 },
    );
  }

  const rawRows = b.rows as Record<string, string>[];
  const rows = filterLh2Rows(rawRows);
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No hay filas válidas en el CSV (lh_id vacío o todas las filas están en blanco)." },
      { status: 400 },
    );
  }
  if (rows.length > 500) {
    return NextResponse.json(
      { error: "Máximo 500 filas por importación." },
      { status: 400 },
    );
  }

  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, status, lead_count")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch no encontrado." }, { status: 404 });
  }

  let added = 0;
  let updated = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const leadData = parseLh2LeadRow(row as Record<string, unknown>);
      const result = await upsertLead(supabase, leadData, "without_answer", batchId);
      if (result.wasCreated) added++;
      else updated++;
    } catch (err) {
      errors.push({
        row: i + 1,
        message: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  // Actualizar lead_count con el conteo real del batch
  const { count: realCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", batchId);

  const leadCount = realCount ?? (batch.lead_count as number | null) ?? 0;

  const batchUpdate: Record<string, unknown> = { lead_count: leadCount };

  // Si hay leads nuevos: pasar a classifying para que el pipeline pueda procesar los nuevos.
  // Nunca bajar desde "error" sin confirmación explícita.
  if (added > 0 && batch.status !== "error") {
    batchUpdate.status = "classifying";
    batchUpdate.error_message = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("batches") as any)
    .update(batchUpdate)
    .eq("id", batchId);

  console.log(`[add-leads] batch=${batchId} — added=${added} updated=${updated} errors=${errors.length} leadCount=${leadCount}`);

  return NextResponse.json({ added, updated, leadCount, errors });
}
