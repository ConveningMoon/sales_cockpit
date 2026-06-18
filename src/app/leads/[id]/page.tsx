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

  // Perfil del lead
  const { data: lead } = await supabase
    .from("leads")
    .select(
      "id, full_name, headline, current_position, current_company, location_name, cs_city, cs_country, cs_group, summary, website, profile_url, lead_status, raw_profile"
    )
    .eq("id", leadId)
    .maybeSingle();

  if (!lead) notFound();

  // Hilo de mensajes ordenado cronológicamente
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, body, sent_at")
    .eq("lead_id", leadId)
    .order("sent_at", { ascending: true });

  // Borrador pendiente más reciente (si existe)
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
      {/* Header con navegación */}
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Bandeja
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium truncate">
            {lead.full_name ?? "Lead sin nombre"}
          </span>
        </div>
      </header>

      {/* Layout: columnas en desktop, apilado en mobile */}
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="grid gap-8 md:grid-cols-[280px_1fr] lg:grid-cols-[320px_1fr]">
          {/* Columna izquierda: perfil */}
          <div className="md:sticky md:top-20 md:self-start">
            <LeadProfile
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
            />
          </div>

          {/* Columna derecha: hilo + pegado + borrador */}
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
