import { createServerClient } from "@/lib/supabase/server";
import { BandejaClient } from "@/components/BandejaClient";

export const dynamic = "force-dynamic";

export default async function BandejaPage() {
  const supabase = createServerClient();

  // Todos los leads activos ordenados por última actividad
  const { data: allLeads } = await supabase
    .from("leads")
    .select(
      "id, full_name, current_company, current_position, cs_city, cs_country, last_activity_at, last_inbound_at"
    )
    .neq("lead_status", "perdido")
    .neq("lead_status", "descartado")
    .order("last_activity_at", { ascending: false });

  // IDs de leads esperando respuesta (para badge y tab "Por responder")
  const { data: awaitingRows } = await supabase
    .from("leads_awaiting_reply")
    .select("id");

  const awaitingIds = awaitingRows?.map((r) => r.id as string) ?? [];

  // Fragmento del último mensaje inbound para los leads en la cola
  const fragmentMap: Record<string, string> = {};
  if (awaitingIds.length > 0) {
    const { data: msgs } = await supabase
      .from("messages")
      .select("lead_id, body")
      .eq("direction", "inbound")
      .in("lead_id", awaitingIds)
      .order("sent_at", { ascending: false });

    msgs?.forEach((m) => {
      const lid = m.lead_id as string;
      if (!fragmentMap[lid]) {
        fragmentMap[lid] = (m.body as string).slice(0, 120);
      }
    });
  }

  return (
    <BandejaClient
      leads={allLeads ?? []}
      awaitingIds={awaitingIds}
      fragmentMap={fragmentMap}
    />
  );
}
