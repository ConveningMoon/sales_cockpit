import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { parseLh2LeadRow } from "@/lib/lh/parser";
import { upsertLead } from "@/lib/leads/ingest";

type ImportRow = Record<string, string>;

interface ImportResult {
  created: number;
  updated: number;
  leadIds: string[];
  errors: { row: number; message: string }[];
}

// POST /api/leads/import
// Body: { rows: Record<string, string>[] }
// Importa leads desde filas de CSV de LH2. Upsert por lh_id; leads nuevos quedan en "nuevo".
export async function POST(req: NextRequest) {
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
      { status: 400 }
    );
  }

  const rows = b.rows as ImportRow[];
  if (rows.length > 500) {
    return NextResponse.json(
      { error: "Máximo 500 filas por importación." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  const result: ImportResult = { created: 0, updated: 0, leadIds: [], errors: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      const leadData = parseLh2LeadRow(row as Record<string, unknown>);

      // Verificar si ya existe para saber si es create o update
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("lh_id", leadData.lh_id!)
        .maybeSingle();

      const { id } = await upsertLead(supabase, leadData, "nuevo");

      result.leadIds.push(id);
      if (existing) {
        result.updated++;
      } else {
        result.created++;
      }
    } catch (err) {
      result.errors.push({
        row: i + 1,
        message: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  }

  return NextResponse.json(result);
}
