import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import {
  conversationDepthOrdinal,
  CONVERSATION_DEPTHS,
  closingReasonLabel,
  answerQualityLabel,
  ANSWER_QUALITIES,
  statusLabel,
} from "@/lib/ui-helpers";
import { DashboardCharts } from "./DashboardCharts";
import type {
  ReplyRatePoint,
  CountPoint,
  CampaignBarPoint,
  CostPoint,
} from "./DashboardCharts";

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
  conversionCount: number;   // interested + in_demo + in_strategy + client
  convDepthAvg: number | null; // ordinal avg 1-5, null si ningún lead tiene valor
  costTotal: number;
}

const CONVERSION_STATUSES = new Set(["interested", "in_demo", "in_strategy", "client"]);

const STATUS_ORDER = [
  "without_answer", "opener_answered", "fu1_sent", "fu2_sent",
  "in_follow_up", "interested", "in_demo", "in_strategy", "client",
  "closed", "passive_discard", "rejected",
];

function replyRatePct(s: MessageStats | undefined): string {
  if (!s || !s.sent) return "—";
  return `${((s.replied / s.sent) * 100).toFixed(1)}%`;
}

function replyRateNum(s: MessageStats | undefined): number | null {
  if (!s || !s.sent) return null;
  return parseFloat(((s.replied / s.sent) * 100).toFixed(1));
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
        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="rounded-xl border border-border/50 bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">Sin campañas. Crea tu primer batch.</p>
          </div>
        </main>
      </div>
    );
  }

  const batchIds = batches.map((b) => b.id as string);

  // 2. Leads — columnas para conteos, analítica y charts
  const { data: allLeadsRaw } = await supabase
    .from("leads")
    .select("id, batch_id, cs_group, lead_status, closing_reason, answer_quality, conversation_depth")
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

  // 4. Armar filas del dashboard
  const rows: BatchRow[] = batches.map((b) => {
    const bId = b.id as string;
    const leadIds = batchLeadIds[bId] ?? [];
    const leadsOfBatch = allLeads.filter((l) => l.batch_id === bId);

    const groupA = leadsOfBatch.filter((l) => l.cs_group === "A").length;
    const groupB = leadsOfBatch.filter((l) => l.cs_group === "B").length;

    const conversionCount = leadsOfBatch.filter((l) =>
      CONVERSION_STATUSES.has(l.lead_status as string)
    ).length;

    // Promedio ordinal de conversation_depth (excluye nulls)
    const depthValues = leadsOfBatch
      .map((l) => conversationDepthOrdinal(l.conversation_depth as string | null))
      .filter((v): v is number => v !== null);
    const convDepthAvg =
      depthValues.length > 0
        ? depthValues.reduce((a, v) => a + v, 0) / depthValues.length
        : null;

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
      conversionCount,
      convDepthAvg,
      costTotal,
    };
  });

  // Footer — totales
  const totalLeads = rows.reduce((a, r) => a + r.totalLeads, 0);
  const totalCost = rows.reduce((a, r) => a + r.costTotal, 0);
  const totalConversion = rows.reduce((a, r) => a + r.conversionCount, 0);
  const weightedCostPerLead = totalLeads > 0 ? totalCost / totalLeads : 0;

  // Promedio ponderado de profundidad (solo filas con dato)
  const depthRows = rows.filter((r) => r.convDepthAvg !== null);
  const weightedDepthSum = depthRows.reduce((a, r) => a + (r.convDepthAvg ?? 0) * r.totalLeads, 0);
  const weightedDepthLeads = depthRows.reduce((a, r) => a + r.totalLeads, 0);
  const weightedDepth = weightedDepthLeads > 0 ? weightedDepthSum / weightedDepthLeads : null;

  // -----------------------------------------------------------------------
  // Datos para los charts
  // -----------------------------------------------------------------------

  // Chart 1: reply rate por campaña
  const replyRateData: ReplyRatePoint[] = rows
    .filter((r) => r.lh2Stats)
    .map((r) => ({
      name: r.name,
      opener: replyRateNum(r.lh2Stats?.opener),
      fu1: replyRateNum(r.lh2Stats?.fu1),
      fu2: replyRateNum(r.lh2Stats?.fu2),
    }));

  // Chart 2: razones de cierre global
  const closingMap = new Map<string, number>();
  for (const l of allLeads) {
    const v = l.closing_reason as string | null;
    if (v) closingMap.set(v, (closingMap.get(v) ?? 0) + 1);
  }
  const closingReasonsData: CountPoint[] = [...closingMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ label: closingReasonLabel(key), count }));

  // Chart 3: calidad de respuesta global
  const qualityMap = new Map<string, number>();
  for (const l of allLeads) {
    const v = l.answer_quality as string | null;
    if (v) qualityMap.set(v, (qualityMap.get(v) ?? 0) + 1);
  }
  const answerQualityData: CountPoint[] = ANSWER_QUALITIES
    .map((q) => ({ label: answerQualityLabel(q.key), count: qualityMap.get(q.key) ?? 0 }))
    .filter((d) => d.count > 0);

  // Chart 4: profundidad de conversación global (en orden ordinal)
  const depthMap = new Map<string, number>();
  for (const l of allLeads) {
    const v = l.conversation_depth as string | null;
    if (v) depthMap.set(v, (depthMap.get(v) ?? 0) + 1);
  }
  const convDepthData: CountPoint[] = CONVERSATION_DEPTHS
    .map((d) => ({
      label: `${d.ordinal}. ${d.key.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ")}`,
      count: depthMap.get(d.key) ?? 0,
    }))
    .filter((d) => d.count > 0);

  // Chart 5: embudo de estados global (orden canónico)
  const statusMap = new Map<string, number>();
  for (const l of allLeads) {
    const v = l.lead_status as string;
    statusMap.set(v, (statusMap.get(v) ?? 0) + 1);
  }
  const statusFunnelData: CountPoint[] = STATUS_ORDER
    .filter((s) => (statusMap.get(s) ?? 0) > 0)
    .map((s) => ({ label: statusLabel(s), count: statusMap.get(s) ?? 0 }));

  // Chart 6: conversión por campaña
  const conversionRateData: CampaignBarPoint[] = rows
    .filter((r) => r.totalLeads > 0)
    .map((r) => ({
      name: r.name,
      value: parseFloat(((r.conversionCount / r.totalLeads) * 100).toFixed(1)),
    }));

  // Chart 7: costo por campaña
  const costData: CostPoint[] = rows
    .filter((r) => r.costTotal > 0)
    .map((r) => ({
      name: r.name,
      costTotal: r.costTotal,
      costPerLead: r.totalLeads > 0 ? r.costTotal / r.totalLeads : 0,
    }));

  const thCls = "text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-[0.07em] pb-2 px-3 whitespace-nowrap";
  const tdCls = "px-3 py-2.5 text-xs text-foreground whitespace-nowrap";
  const tdNum = `${tdCls} tabular-nums text-right`;

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        {/* Tabla comparativa */}
        <div className="overflow-x-auto rounded-xl border border-border/50 bg-card">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr className="border-b border-border/50">
                <th className={`${thCls} text-left`}>Campaña</th>
                <th className={`${thCls} text-right`}>Total</th>
                <th className={`${thCls} text-right`}>A</th>
                <th className={`${thCls} text-right`}>B</th>
                <th className={`${thCls} text-right`}>Opener</th>
                <th className={`${thCls} text-right`}>FU1</th>
                <th className={`${thCls} text-right`}>FU2</th>
                <th className={`${thCls} text-right`}>Conv.</th>
                <th className={`${thCls} text-right`}>Profund.</th>
                <th className={`${thCls} text-right`}>Costo IA</th>
                <th className={`${thCls} text-right`}>$/lead</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const convRate = row.totalLeads > 0
                  ? ((row.conversionCount / row.totalLeads) * 100).toFixed(1) + "%"
                  : "—";
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
                    {/* Conversión */}
                    <td className={tdNum}>
                      <span className={row.conversionCount > 0 ? "text-emerald-400" : "text-muted-foreground/40"}>
                        {convRate}
                      </span>
                    </td>
                    {/* Profundidad ordinal (excluye nulls) */}
                    <td className={tdNum}>
                      {row.convDepthAvg !== null ? fmt(row.convDepthAvg, 1) : "—"}
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
                  {totalLeads > 0
                    ? `${((totalConversion / totalLeads) * 100).toFixed(1)}%`
                    : "—"}
                </td>
                <td className={`${tdNum} font-semibold`}>
                  {weightedDepth !== null ? fmt(weightedDepth, 1) : "—"}
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
          Reply rates: tasas agrupadas (Σ respondidos / Σ enviados) sobre campañas con datos de LH2.
          Conversión: (Interested + In Demo + In Strategy + Client) / Total.
          Profund.: promedio ordinal 1–5 sobre leads con valor registrado (nulos excluidos).
          Costo: atribuido por lead (clasificación + secuencia + borradores).
        </p>

        {/* Gráficas */}
        <DashboardCharts
          replyRateData={replyRateData}
          closingReasonsData={closingReasonsData}
          answerQualityData={answerQualityData}
          convDepthData={convDepthData}
          statusFunnelData={statusFunnelData}
          conversionRateData={conversionRateData}
          costData={costData}
        />
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
