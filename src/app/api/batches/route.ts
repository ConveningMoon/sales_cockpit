import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseLh2LeadRow, filterLh2Rows } from "@/lib/lh/parser";
import { upsertLead } from "@/lib/leads/ingest";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido." }, { status: 400 });
  }

  const b = rawBody as Record<string, unknown>;
  const rows = b.rows as Record<string, string>[] | undefined;
  const name = typeof b.name === "string" ? b.name.trim() : null;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "Se requiere un array rows no vacío." }, { status: 400 });
  }
  if (rows.length > 500) {
    return NextResponse.json({ error: "Máximo 500 filas por batch." }, { status: 400 });
  }

  const supabase = createServerClient();

  // 1. Crear el batch
  const batchName = name ?? `Batch ${new Date().toLocaleDateString("es", { day: "2-digit", month: "short", year: "numeric" })}`;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: batch, error: batchErr } = await (supabase.from("batches") as any)
    .insert({ name: batchName, lead_count: 0, status: "pending" })
    .select("id")
    .single();

  if (batchErr || !batch) {
    return NextResponse.json(
      {
        error: `Error al crear el batch en base de datos: ${batchErr?.message ?? "respuesta vacía"}`,
        stage: "import",
      },
      { status: 500 },
    );
  }

  const batchId = batch.id as string;
  const errors: { row: number; message: string }[] = [];
  const leadIds: string[] = [];
  let created = 0;
  let updated = 0;

  // 2. Importar leads vinculados al batch — filtrar filas sin lh_id (relleno vacío de LH2)
  const validRows = filterLh2Rows(rows);
  for (let i = 0; i < validRows.length; i++) {
    try {
      const leadData = parseLh2LeadRow(validRows[i]);
      const result = await upsertLead(supabase, leadData, "without_answer", batchId);
      leadIds.push(result.id);
      if (result.wasCreated) created++;
      else updated++;
    } catch (err) {
      errors.push({ row: i + 1, message: err instanceof Error ? err.message : String(err) });
    }
  }

  const leadCount = leadIds.length;

  // 3. Actualizar lead_count en el batch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("batches") as any)
    .update({ lead_count: leadCount })
    .eq("id", batchId);

  return NextResponse.json({ batchId, leadCount, created, updated, errors }, { status: 201 });
}

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("batches")
    .select("id, name, source, lead_count, status, error_message, imported_at")
    .order("imported_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ batches: data ?? [] });
}
