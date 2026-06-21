import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface MessageStats {
  sent: number;
  replied: number;
}
interface Lh2Stats {
  opener: MessageStats;
  fu1: MessageStats;
  fu2: MessageStats;
}

interface BatchRow {
  id: string;
  name: string;
  status: string;
  importedAt: string;
  lh2Stats: Lh2Stats | null;
  totalLeads: number;
  groupA: number;
  groupB: number;
  groupNoEscribir: number;
  sinClasificar: number;
  msgCount: number;
  costTotal: number;
}

function replyRatePct(s: MessageStats | undefined): string {
  if (!s || !s.sent) return "—";
  return `${((s.replied / s.sent) * 100).toFixed(1)}%`;
}

function pooledRate(batches: BatchRow[], field: keyof Lh2Stats): string {
  let totalSent = 0;
  let totalReplied = 0;
  for (const b of batches) {
    const s = b.lh2Stats?.[field];
    if (s) {
      totalSent += s.sent;
      totalReplied += s.replied;
    }
  }
  if (!totalSent) return "—";
  return `${((totalReplied / totalSent) * 100).toFixed(1)}%`;
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("es", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  classifying: "Clasificando",
  fetching_market: "Mercado",
  generating: "Generando",
  done: "Completo",
  error: "Error",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-zinc-400",
  classifying: "text-indigo-400",
  fetching_market: "text-zinc-400",
  generating: "text-teal-400",
  done: "text-emerald-400",
  error: "text-rose-400",
};

export default async function DashboardPage() {
  const supabase = createServerClient();

  // 1. Todos los batches
  const { data: batchesRaw } = await supabase
    .from("batches")
    .select("id, name, status, lead_count, lh2_stats, imported_at")
    .order("imported_at", { ascending: false });

  const batches = batchesRaw ?? [];

  if (batches.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <DashboardHeader />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="rounded-xl border border-border/50 bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">Sin campañas. Crea tu primer batch.</p>
          </div>
        </main>
      </div>
    );
  }

  const batchIds = batches.map((b) => b.id as string);

  // 2. Leads de todos los batches (solo columnas necesarias para conteos)
  const { data: allLeadsRaw } = await supabase
    .from("leads")
    .select("id, batch_id, cs_group")
    .in("batch_id", batchIds);

  const allLeads = allLeadsRaw ?? [];

  // Mapa batch_id → lead_ids
  const batchLeadIds: Record<string, string[]> = {};
  for (const lead of allLeads) {
    const bId = lead.batch_id as string | null;
    if (!bId) continue;
    if (!batchLeadIds[bId]) batchLeadIds[bId] = [];
    batchLeadIds[bId].push(lead.id as string);
  }

  const allLeadIds = Object.values(batchLeadIds).flat();

  // 3. AI usage — costo por lead
  const leadCostMap = new Map<string, number>();
  if (allLeadIds.length > 0) {
    const { data: usageRows } = await supabase
      .from("ai_usage")
      .select("lead_id, cost_usd")
      .in("lead_id", allLeadIds);
    for (const row of usageRows ?? []) {
      const lid = row.lead_id as string | null;
      if (!lid) continue;
      leadCostMap.set(lid, (leadCostMap.get(lid) ?? 0) + ((row.cost_usd as number | null) ?? 0));
    }
  }

  // 4. Mensajes — conteo por lead
  const leadMsgCount = new Map<string, number>();
  if (allLeadIds.length > 0) {
    const { data: msgRows } = await supabase
      .from("messages")
      .select("lead_id")
      .in("lead_id", allLeadIds);
    for (const row of msgRows ?? []) {
      const lid = row.lead_id as string | null;
      if (!lid) continue;
      leadMsgCount.set(lid, (leadMsgCount.get(lid) ?? 0) + 1);
    }
  }

  // 5. Armar filas del dashboard
  const rows: BatchRow[] = batches.map((b) => {
    const bId = b.id as string;
    const leadIds = batchLeadIds[bId] ?? [];
    const leadsOfBatch = allLeads.filter((l) => l.batch_id === bId);

    const groupA = leadsOfBatch.filter((l) => l.cs_group === "A").length;
    const groupB = leadsOfBatch.filter((l) => l.cs_group === "B").length;
    const groupNoEscribir = leadsOfBatch.filter((l) => l.cs_group === "NO_ESCRIBIR").length;
    const sinClasificar = leadsOfBatch.filter((l) => !l.cs_group).length;

    const msgCount = leadIds.reduce((acc, lid) => acc + (leadMsgCount.get(lid) ?? 0), 0);
    const costTotal = leadIds.reduce((acc, lid) => acc + (leadCostMap.get(lid) ?? 0), 0);

    return {
      id: bId,
      name: b.name as string,
      status: b.status as string,
      importedAt: new Date(b.imported_at as string).toLocaleDateString("es", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
      lh2Stats: (b.lh2_stats as Lh2Stats | null) ?? null,
      totalLeads: leadIds.length,
      groupA,
      groupB,
      groupNoEscribir,
      sinClasificar,
      msgCount,
      costTotal,
    };
  });

  // Footer — totales
  const totalLeads = rows.reduce((a, r) => a + r.totalLeads, 0);
  const totalCost = rows.reduce((a, r) => a + r.costTotal, 0);
  const totalMsgs = rows.reduce((a, r) => a + r.msgCount, 0);
  const weightedDepth = totalLeads > 0 ? totalMsgs / totalLeads : 0;
  const weightedCostPerLead = totalLeads > 0 ? totalCost / totalLeads : 0;

  const thCls = "text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.07em] pb-2 px-3 whitespace-nowrap";
  const tdCls = "px-3 py-2.5 text-xs text-foreground whitespace-nowrap";
  const tdNum = `${tdCls} tabular-nums text-right`;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
          <table className="w-full min-w-[800px] border-collapse">
            <thead>
              <tr className="border-b border-border/50">
                <th className={`${thCls} text-left`}>Campaña</th>
                <th className={`${thCls} text-right`}>Total</th>
                <th className={`${thCls} text-right`}>A</th>
                <th className={`${thCls} text-right`}>B</th>
                <th className={`${thCls} text-right`}>Opener</th>
                <th className={`${thCls} text-right`}>FU1</th>
                <th className={`${thCls} text-right`}>FU2</th>
                <th className={`${thCls} text-right`}>Profund.</th>
                <th className={`${thCls} text-right`}>Costo IA</th>
                <th className={`${thCls} text-right`}>$/lead</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const depth = row.totalLeads > 0 ? row.msgCount / row.totalLeads : 0;
                const costPerLead = row.totalLeads > 0 ? row.costTotal / row.totalLeads : 0;
                const isLast = i === rows.length - 1;

                return (
                  <tr
                    key={row.id}
                    className={`transition-colors hover:bg-muted/20 ${!isLast ? "border-b border-border/30" : ""}`}
                  >
                    {/* Campaña */}
                    <td className={`${tdCls} max-w-[220px]`}>
                      <Link
                        href={`/batches/${row.id}`}
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        {row.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] ${STATUS_COLORS[row.status] ?? "text-zinc-400"}`}>
                          {STATUS_LABELS[row.status] ?? row.status}
                        </span>
                        <span className="text-[10px] text-muted-foreground/50">{row.importedAt}</span>
                      </div>
                    </td>
                    {/* Leads */}
                    <td className={tdNum}>{row.totalLeads}</td>
                    <td className={tdNum}>
                      {row.groupA > 0 ? (
                        <span className="text-indigo-400">{row.groupA}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    <td className={tdNum}>
                      {row.groupB > 0 ? (
                        <span className="text-teal-400">{row.groupB}</span>
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </td>
                    {/* Reply rates */}
                    <td className={tdNum}>{replyRatePct(row.lh2Stats?.opener)}</td>
                    <td className={tdNum}>{replyRatePct(row.lh2Stats?.fu1)}</td>
                    <td className={tdNum}>{replyRatePct(row.lh2Stats?.fu2)}</td>
                    {/* Profundidad */}
                    <td className={tdNum}>
                      {row.totalLeads > 0 ? fmt(depth, 1) : "—"}
                    </td>
                    {/* Costo */}
                    <td className={tdNum}>
                      {row.costTotal > 0 ? `$${fmt(row.costTotal, 4)}` : "—"}
                    </td>
                    <td className={tdNum}>
                      {row.totalLeads > 0 && row.costTotal > 0
                        ? `$${fmt(costPerLead, 4)}`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Footer de totales */}
            <tfoot>
              <tr className="border-t border-border/50 bg-muted/20">
                <td className={`${tdCls} font-semibold text-foreground`}>
                  Total — {rows.length} campaña{rows.length !== 1 ? "s" : ""}
                </td>
                <td className={`${tdNum} font-semibold`}>{totalLeads}</td>
                <td className={tdNum} />
                <td className={tdNum} />
                <td className={`${tdNum} font-semibold`}>{pooledRate(rows, "opener")}</td>
                <td className={`${tdNum} font-semibold`}>{pooledRate(rows, "fu1")}</td>
                <td className={`${tdNum} font-semibold`}>{pooledRate(rows, "fu2")}</td>
                <td className={`${tdNum} font-semibold`}>
                  {totalLeads > 0 ? fmt(weightedDepth, 1) : "—"}
                </td>
                <td className={`${tdNum} font-semibold`}>
                  {totalCost > 0 ? `$${fmt(totalCost, 4)}` : "—"}
                </td>
                <td className={`${tdNum} font-semibold`}>
                  {totalLeads > 0 && totalCost > 0 ? `$${fmt(weightedCostPerLead, 4)}` : "—"}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-[11px] text-muted-foreground/60 text-center">
          Reply rates: tasas agrupadas (Σ respondidos / Σ enviados) sobre campañas con datos de LH2. Profundidad: mensajes totales / total leads. Costo: atribuido por lead (clasificación + secuencia + borradores).
        </p>
      </main>
    </div>
  );
}

function DashboardHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center gap-3">
        <Link
          href="/"
          className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors"
        >
          ← Bandeja
        </Link>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium text-foreground">Dashboard</span>
      </div>
    </header>
  );
}
