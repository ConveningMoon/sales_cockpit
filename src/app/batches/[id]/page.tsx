import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { BatchPipeline } from "./_components/BatchPipeline";
import type { BatchStatus } from "@/types/database";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function BatchPage({ params }: PageProps) {
  const { id: batchId } = await params;
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("batches")
    .select("id, name, source, lead_count, status, error_message, market_batch_id, outreach_batch_id, imported_at")
    .eq("id", batchId)
    .maybeSingle();

  if (!batch) notFound();

  // Resumen de clasificación
  const { data: counts } = await supabase
    .from("leads")
    .select("cs_group")
    .eq("batch_id", batchId);

  const groupCounts = (counts ?? []).reduce<Record<string, number>>((acc, l) => {
    const g = (l.cs_group as string | null) ?? "sin_clasificar";
    acc[g] = (acc[g] ?? 0) + 1;
    return acc;
  }, {});

  const importedAt = new Date(batch.imported_at as string).toLocaleDateString("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/batches"
            className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            ← Batches
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium text-foreground truncate">
            {batch.name as string}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        {/* Info del batch */}
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-4">
          <div>
            <h1 className="text-[1.15rem] font-semibold text-foreground leading-tight">
              {batch.name as string}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{importedAt}</p>
          </div>

          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
                Total leads
              </dt>
              <dd className="font-semibold text-foreground">{batch.lead_count as number}</dd>
            </div>
            {["A", "B", "NO_ESCRIBIR", "sin_clasificar"].map((g) =>
              groupCounts[g] !== undefined ? (
                <div key={g}>
                  <dt className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
                    Grupo {g === "sin_clasificar" ? "sin clasificar" : g}
                  </dt>
                  <dd className="font-semibold text-foreground">{groupCounts[g]}</dd>
                </div>
              ) : null
            )}
          </dl>
        </div>

        {/* Pipeline */}
        <div className="rounded-xl border border-border/50 bg-card p-5 space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
            Pipeline
          </h2>
          <BatchPipeline
            batchId={batchId}
            initialStatus={batch.status as BatchStatus}
            leadCount={batch.lead_count as number}
            errorMessage={(batch.error_message as string | null) ?? null}
            marketBatchInFlight={Boolean(batch.market_batch_id)}
            outreachBatchInFlight={Boolean(batch.outreach_batch_id)}
          />
        </div>
      </main>
    </div>
  );
}
