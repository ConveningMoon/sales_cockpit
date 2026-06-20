import {
  statusLabel,
  statusBadgeClass,
  closingReasonLabel,
  answerQualityLabel,
  answerQualityBadgeClass,
} from "@/lib/ui-helpers";

type Dist = { key: string; count: number }[];

type Props = {
  leadCount: number;
  funnel: { status: string; count: number }[];
  avgDepth: number;
  closingReasons: Dist;
  answerQualities: Dist;
  costTotal: number;
  costAvgPerLead: number;
};

function pct(count: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((count / total) * 100)}%`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
      {children}
    </h3>
  );
}

// Barra de distribución simple con etiqueta + conteo + %.
function DistRow({ label, count, total, badgeClass }: {
  label: string; count: number; total: number; badgeClass?: string;
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-40 shrink-0">
        {badgeClass ? (
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${badgeClass}`}>{label}</span>
        ) : (
          <span className="text-foreground/90">{label}</span>
        )}
      </div>
      <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{ width: pct(count, total), background: "var(--gradient-brand)" }}
        />
      </div>
      <div className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {count} · {pct(count, total)}
      </div>
    </div>
  );
}

export function BatchAnalytics({
  leadCount,
  funnel,
  avgDepth,
  closingReasons,
  answerQualities,
  costTotal,
  costAvgPerLead,
}: Props) {
  return (
    <div className="rounded-xl border border-border/50 bg-card p-5 space-y-7">
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.08em]">
        Analítica de campaña
      </h2>

      {/* Costo + profundidad (tarjetas) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
            Costo de IA total
          </p>
          <p className="text-foreground font-semibold tabular-nums">${costTotal.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
            Costo promedio / lead
          </p>
          <p className="text-foreground font-semibold tabular-nums">${costAvgPerLead.toFixed(4)}</p>
        </div>
        <div>
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-0.5">
            Profundidad media
          </p>
          <p className="text-foreground font-semibold tabular-nums">
            {avgDepth.toFixed(1)} <span className="text-xs font-normal text-muted-foreground">msg/lead</span>
          </p>
        </div>
      </div>

      {/* Embudo de estado */}
      <div className="space-y-2.5">
        <SectionTitle>Embudo de estado</SectionTitle>
        {funnel.length > 0 ? (
          <div className="space-y-2">
            {funnel.map((f) => (
              <DistRow
                key={f.status}
                label={statusLabel(f.status)}
                count={f.count}
                total={leadCount}
                badgeClass={statusBadgeClass(f.status)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70">Sin leads.</p>
        )}
      </div>

      {/* Calidad de respuesta */}
      <div className="space-y-2.5">
        <SectionTitle>Calidad de respuesta</SectionTitle>
        {answerQualities.length > 0 ? (
          <div className="space-y-2">
            {answerQualities.map((q) => (
              <DistRow
                key={q.key}
                label={answerQualityLabel(q.key)}
                count={q.count}
                total={leadCount}
                badgeClass={answerQualityBadgeClass(q.key)}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70">Sin calificaciones aún.</p>
        )}
      </div>

      {/* Razones de cierre */}
      <div className="space-y-2.5">
        <SectionTitle>Razones de cierre</SectionTitle>
        {closingReasons.length > 0 ? (
          <div className="space-y-2">
            {closingReasons.map((r) => (
              <DistRow
                key={r.key}
                label={closingReasonLabel(r.key)}
                count={r.count}
                total={leadCount}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/70">Sin razones de cierre registradas.</p>
        )}
      </div>
    </div>
  );
}
