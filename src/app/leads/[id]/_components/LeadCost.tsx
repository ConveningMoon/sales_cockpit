import { taskTypeLabel } from "@/lib/ui-helpers";

type Props = {
  total: number;
  byStage: { taskType: string; cost: number }[];
};

// Costo de IA atribuido a este lead (suma de ai_usage.cost_usd WHERE lead_id = lead).
// El dato de mercado es por geografía/compartido → no se atribuye a un lead.
export function LeadCost({ total, byStage }: Props) {
  return (
    <div>
      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.08em] mb-1.5">
        Costo de IA
      </p>
      <p className="text-foreground font-semibold tabular-nums">
        ${total.toFixed(4)}
      </p>
      {byStage.length > 0 ? (
        <dl className="mt-2 space-y-1">
          {byStage.map((s) => (
            <div key={s.taskType} className="flex items-center justify-between text-xs">
              <dt className="text-muted-foreground">{taskTypeLabel(s.taskType)}</dt>
              <dd className="text-foreground/80 tabular-nums">${s.cost.toFixed(4)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground/70">Sin llamadas de IA registradas.</p>
      )}
    </div>
  );
}
