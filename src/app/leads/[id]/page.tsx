import Link from "next/link";
import { notFound } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { LeadProfile } from "./_components/LeadProfile";
import { FichaClient } from "./_components/FichaClient";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function FichaPage({ params }: PageProps) {
  const { id: leadId } = await params;
  const supabase = createServerClient();

  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, full_name, headline, current_position, current_company, location_name, cs_city, cs_country, cs_group, summary, website, profile_url, lead_status, closing_reason, answer_quality, raw_profile"
    )
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) notFound();

  // Costo de IA atribuido a este lead (suma por task_type). El dato de mercado
  // es por geografía/compartido → no lleva lead_id → no entra acá.
  const { data: usageRows } = await supabase
    .from("ai_usage")
    .select("task_type, cost_usd")
    .eq("lead_id", leadId);

  const costMap = new Map<string, number>();
  let costTotal = 0;
  for (const row of usageRows ?? []) {
    const cost = (row.cost_usd as number | null) ?? 0;
    const tt = row.task_type as string;
    costMap.set(tt, (costMap.get(tt) ?? 0) + cost);
    costTotal += cost;
  }
  const costByStage = [...costMap.entries()]
    .map(([taskType, cost]) => ({ taskType, cost }))
    .sort((a, b) => b.cost - a.cost);

  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, body, sent_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  const { data: pendingDraft } = await supabase
    .from("drafts")
    .select("id, body, model")
    .eq("lead_id", leadId)
    .eq("status", "pending")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const initialMessages = (messages ?? []).map((m) => ({
    id: m.id as string,
    direction: m.direction as string,
    body: m.body as string,
    sent_at: m.sent_at as string,
  }));

  const initialDraft = pendingDraft
    ? {
        id: pendingDraft.id as string,
        body: pendingDraft.body as string,
        model: pendingDraft.model as string,
      }
    : null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-muted-foreground/70 hover:text-muted-foreground transition-colors"
          >
            ← Bandeja
          </Link>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium text-foreground truncate">
            {lead.full_name ?? "Lead sin nombre"}
          </span>
        </div>
      </header>

      {/* Layout 2 columnas en md+, apilado en mobile */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]">
          {/* Columna izquierda: perfil */}
          <div className="md:sticky md:top-20 md:self-start">
            <LeadProfile
              leadId={leadId}
              fullName={lead.full_name}
              headline={lead.headline}
              currentPosition={lead.current_position}
              currentCompany={lead.current_company}
              locationName={lead.location_name}
              csCity={lead.cs_city}
              csCountry={lead.cs_country}
              csGroup={lead.cs_group}
              summary={lead.summary}
              website={lead.website}
              profileUrl={lead.profile_url ?? null}
              leadStatus={lead.lead_status as string}
              closingReason={(lead.closing_reason as string | null) ?? null}
              answerQuality={(lead.answer_quality as string | null) ?? null}
              costTotal={costTotal}
              costByStage={costByStage}
            />
          </div>

          {/* Columna derecha: hilo + banco de trabajo */}
          <div>
            <FichaClient
              leadId={leadId}
              leadFullName={lead.full_name ?? "Lead"}
              myName={
                (lead.raw_profile as Record<string, unknown> | null)
                  ?.my_full_name as string ?? ""
              }
              initialMessages={initialMessages}
              initialDraft={initialDraft}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
