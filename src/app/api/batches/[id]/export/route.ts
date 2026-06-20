import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

// RFC 4180 con delimitador ";" (formato LH2).
// Envuelve en comillas si el valor contiene ";", '"', CR o LF; escapa comillas internas.
function csvCell(val: string | null): string {
  const s = val ?? "";
  if (s.includes(";") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(cells: (string | null)[]): string {
  return cells.map(csvCell).join(";");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: batchId } = await params;
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, name, status")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch no encontrado.", stage: "export" }, { status: 404 });
  }

  // Cargar leads A/B con sus secuencias de outreach
  const { data: leads, error: leadsError } = await (supabase
    .from("leads") as any)
    .select(
      "lh_id, profile_url, full_name, cs_group, cs_city, cs_country, outreach_sequence(kind, body)",
    )
    .eq("batch_id", batchId)
    .in("cs_group", ["A", "B"])
    .order("full_name", { ascending: true });

  if (leadsError) {
    return NextResponse.json(
      { error: `Error al consultar leads: ${leadsError.message}`, stage: "export" },
      { status: 500 },
    );
  }

  const header = "lh_id;profile_url;full_name;cs_group;cs_city;cs_country;cs_msg_opener;cs_fu1;cs_fu2";
  const rows = [header];

  for (const lead of (leads ?? []) as any[]) {
    const seqs: { kind: string; body: string }[] = lead.outreach_sequence ?? [];
    const cold = seqs.find((s) => s.kind === "cold")?.body ?? "";
    const fu1 = seqs.find((s) => s.kind === "fu1")?.body ?? "";
    const fu2 = seqs.find((s) => s.kind === "fu2")?.body ?? "";
    rows.push(
      csvRow([
        lead.lh_id,
        lead.profile_url,
        lead.full_name,
        lead.cs_group,
        lead.cs_city,
        lead.cs_country,
        cold,
        fu1,
        fu2,
      ]),
    );
  }

  const csv = rows.join("\r\n") + "\r\n"; // RFC 4180: CRLF
  const batchName = (batch.name as string).replace(/[^a-zA-Z0-9_-]/g, "_");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="batch_${batchName}_outreach.csv"`,
    },
  });
}
