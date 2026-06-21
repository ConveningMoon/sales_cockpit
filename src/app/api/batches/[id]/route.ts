import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

interface MessageStats {
  sent: number;
  replied: number;
}

interface Lh2Stats {
  opener: MessageStats;
  fu1: MessageStats;
  fu2: MessageStats;
}

function isMessageStats(v: unknown): v is MessageStats {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.sent === "number" && typeof o.replied === "number";
}

function isLh2Stats(v: unknown): v is Lh2Stats {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return isMessageStats(o.opener) && isMessageStats(o.fu1) && isMessageStats(o.fu2);
}

// PATCH /api/batches/[id]
// Acepta: { lh2_stats: Lh2Stats | null }
export async function PATCH(
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
  const update: Record<string, unknown> = {};

  if ("lh2_stats" in b) {
    const stats = b.lh2_stats;
    if (stats !== null && !isLh2Stats(stats)) {
      return NextResponse.json(
        {
          error:
            "lh2_stats debe ser null o un objeto con las claves opener, fu1, fu2, cada una con sent y replied (números).",
        },
        { status: 400 },
      );
    }
    update.lh2_stats = stats;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Sin campos actualizables en el body." }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) {
    return NextResponse.json({ error: "Batch no encontrado." }, { status: 404 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from("batches") as any)
    .update(update)
    .eq("id", batchId);

  if (error) {
    return NextResponse.json({ error: `Error al actualizar el batch: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
