import Link from "next/link";
import { createServerClient } from "@/lib/supabase/server";
import { statusBadgeClass, statusLabel } from "@/lib/ui-helpers";
import { FollowupGenerator } from "./_components/FollowupGenerator";

export const dynamic = "force-dynamic";

// Cadencia: tiempo mínimo (en días) desde que el lead entró al estado antes
// de aparecer en la lista de vencidos. Solo estados de espera activa.
const CADENCE: Record<string, { days: number; action: "fu1" | "fu2" | "close" }> = {
  opener_answered: { days: 3, action: "fu1" },
  fu1_sent:        { days: 5, action: "fu2" },
  fu2_sent:        { days: 7, action: "close" },
};

type LeadRow = {
  id: string;
  full_name: string | null;
  current_company: string | null;
  current_position: string | null;
  lead_status: string;
  status_changed_at: string;
  last_inbound_at: string | null;
  batch_name: string | null;
  days_overdue: number;
  action: "fu1" | "fu2" | "close";
};

export default async function SeguimientosPage() {
  const supabase = createServerClient();
  const now = Date.now();

  // Calcular umbrales de tiempo para cada estado
  const cutoffs = Object.entries(CADENCE).map(([status, { days, action }]) => ({
    status,
    action,
    cutoff: new Date(now - days * 24 * 60 * 60 * 1000).toISOString(),
  }));

  // Tres queries en paralelo, una por estado de cadencia
  const [g1, g2, g3] = await Promise.all(
    cutoffs.map(({ status, cutoff }) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("leads")
        .select(
          "id, full_name, current_company, current_position, lead_status, status_changed_at, last_inbound_at, batch:batches(name)"
        )
        .eq("lead_status", status)
        .lte("status_changed_at", cutoff)
        .order("status_changed_at", { ascending: true })
    )
  );

  // Filtrar en JS: excluir leads que respondieron después del último cambio de estado
  function noNewReply(lead: {
    last_inbound_at: string | null;
    status_changed_at: string;
  }) {
    if (!lead.last_inbound_at) return true;
    return lead.last_inbound_at <= lead.status_changed_at;
  }

  function toLeadRow(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    raw: any,
    action: "fu1" | "fu2" | "close"
  ): LeadRow {
    const daysOverdue = Math.floor(
      (now - new Date(raw.status_changed_at).getTime()) / (24 * 60 * 60 * 1000)
    );
    return {
      id: raw.id,
      full_name: raw.full_name,
      current_company: raw.current_company,
      current_position: raw.current_position,
      lead_status: raw.lead_status,
      status_changed_at: raw.status_changed_at,
      last_inbound_at: raw.last_inbound_at,
      batch_name: (raw.batch as { name: string } | null)?.name ?? null,
      days_overdue: daysOverdue,
      action,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fu1Leads: LeadRow[] = ((g1.data ?? []) as any[])
    .filter(noNewReply)
    .map((l) => toLeadRow(l, "fu1"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fu2Leads: LeadRow[] = ((g2.data ?? []) as any[])
    .filter(noNewReply)
    .map((l) => toLeadRow(l, "fu2"));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const closeLeads: LeadRow[] = ((g3.data ?? []) as any[])
    .filter(noNewReply)
    .map((l) => toLeadRow(l, "close"));

  const total = fu1Leads.length + fu2Leads.length + closeLeads.length;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors"
            >
              ← Bandeja
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-sm font-medium text-foreground">Seguimientos</span>
          </div>
          {total > 0 && (
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full tabular-nums"
              style={{
                background: "var(--gradient-brand)",
                color: "hsl(248 20% 8%)",
              }}
            >
              {total} pendiente{total !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-8">
        {total === 0 && (
          <div className="rounded-xl border border-border/50 bg-card px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Todo al día. Sin seguimientos pendientes.
            </p>
          </div>
        )}

        {fu1Leads.length > 0 && (
          <SeguimientoSection
            title="Enviar FU1 — Re-pregunta"
            subtitle="Opener sin respuesta ≥ 3 días"
            leads={fu1Leads}
          />
        )}

        {fu2Leads.length > 0 && (
          <SeguimientoSection
            title="Enviar FU2 — Oferta concreta"
            subtitle="FU1 sin respuesta ≥ 5 días"
            leads={fu2Leads}
          />
        )}

        {closeLeads.length > 0 && (
          <SeguimientoSection
            title="Considerar cerrar"
            subtitle="FU2 sin respuesta ≥ 7 días"
            leads={closeLeads}
          />
        )}
      </main>
    </div>
  );
}

function SeguimientoSection({
  title,
  subtitle,
  leads,
}: {
  title: string;
  subtitle: string;
  leads: LeadRow[];
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>
      </div>
      <div className="space-y-2">
        {leads.map((lead) => (
          <SeguimientoCard key={lead.id} lead={lead} />
        ))}
      </div>
    </section>
  );
}

function SeguimientoCard({ lead }: { lead: LeadRow }) {
  const subtitle = [lead.current_position, lead.current_company]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3.5 shadow-[0_1px_4px_hsl(238_16%_4%/0.45)]">
      {/* Header: nombre + estado + días */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/leads/${lead.id}`}
              className="font-semibold text-sm text-foreground hover:text-primary transition-colors truncate"
            >
              {lead.full_name ?? "Sin nombre"}
            </Link>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${statusBadgeClass(lead.lead_status)}`}
            >
              {statusLabel(lead.lead_status)}
            </span>
          </div>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
          {lead.batch_name && (
            <p className="text-[10px] text-muted-foreground/50 mt-0.5">{lead.batch_name}</p>
          )}
        </div>

        <div className="text-right shrink-0">
          <span className="text-[11px] font-semibold text-amber-400 tabular-nums">
            {lead.days_overdue}d
          </span>
        </div>
      </div>

      {/* Acción */}
      <div className="mt-3">
        {lead.action === "close" ? (
          <p className="text-[11px] text-muted-foreground/70 italic">
            Sin respuesta al FU2 — considera{" "}
            <Link
              href={`/leads/${lead.id}`}
              className="text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
            >
              marcar como Closed en la ficha
            </Link>
            .
          </p>
        ) : (
          <FollowupGenerator leadId={lead.id} fuType={lead.action} />
        )}
      </div>
    </div>
  );
}
