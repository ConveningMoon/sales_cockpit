import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import type { BatchStatus } from "@/types/database";

export const dynamic = "force-dynamic";

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    pending:         "Pendiente",
    classifying:     "Clasificando",
    fetching_market: "Mercado",
    generating:      "Listo",
    done:            "Completo",
    error:           "Error",
  };
  return map[s] ?? s;
}

function statusBadge(s: BatchStatus): string {
  const map: Record<BatchStatus, string> = {
    pending:         "bg-zinc-800 text-zinc-300 border border-zinc-700/60",
    classifying:     "bg-indigo-950 text-indigo-300 border border-indigo-800/60",
    fetching_market: "bg-blue-950 text-blue-300 border border-blue-800/60",
    generating:      "bg-teal-950 text-teal-300 border border-teal-800/60",
    done:            "bg-emerald-900 text-emerald-200 border border-emerald-700/60",
    error:           "bg-rose-950 text-rose-400 border border-rose-900/60",
  };
  return map[s] ?? "bg-zinc-800 text-zinc-300 border border-zinc-700";
}

export default async function BatchesPage() {
  const supabase = createServerClient();
  const { data: batches } = await supabase
    .from("batches")
    .select("id, name, lead_count, status, imported_at")
    .order("imported_at", { ascending: false });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              ← Bandeja
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-medium text-foreground">Batches de outreach</span>
          </div>
          <Link
            href="/batches/new"
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-primary-foreground transition-all
                       hover:opacity-90 hover:shadow-[0_0_12px_hsl(248_82%_67%/0.35)]"
            style={{ background: "var(--gradient-brand)" }}
          >
            + Nuevo batch
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8">
        {!batches || batches.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground text-sm mb-4">No hay batches todavía.</p>
            <Link
              href="/batches/new"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-primary-foreground"
              style={{ background: "var(--gradient-brand)" }}
            >
              Crear primer batch
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {batches.map((b) => {
              const date = new Date(b.imported_at as string).toLocaleDateString("es", {
                day: "numeric",
                month: "short",
                year: "numeric",
              });
              return (
                <Link
                  key={b.id as string}
                  href={`/batches/${b.id}`}
                  className="flex items-center justify-between rounded-xl border border-border/50 bg-card
                             px-4 py-3.5 hover:border-border hover:bg-card/80 transition-colors group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {b.name as string}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {b.lead_count as number} lead{(b.lead_count as number) !== 1 ? "s" : ""} · {date}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 ml-4 text-[11px] font-medium px-2 py-0.5 rounded-md ${statusBadge(b.status as BatchStatus)}`}
                  >
                    {statusLabel(b.status as string)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
