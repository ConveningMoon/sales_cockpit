import { createServerClient } from "@/lib/supabase/server";
import { BandejaClient } from "@/components/BandejaClient";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function BandejaPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const statusFilter = typeof sp.status === "string" ? sp.status.trim() : "";
  const batchFilter = typeof sp.batch === "string" ? sp.batch.trim() : "";

  const supabase = createServerClient();

  // Batches disponibles para el dropdown de filtro
  const { data: batchesData } = await supabase
    .from("batches")
    .select("id, name")
    .order("imported_at", { ascending: false });
  const batches = (batchesData ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
  }));

  // Leads filtrados por search + estado + batch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let leadsQuery: any = supabase
    .from("leads")
    .select(
      "id, full_name, current_company, current_position, cs_city, cs_country, lead_status, last_activity_at, last_inbound_at, batch:batches(name)"
    );

  if (statusFilter) {
    // Filtro explícito: muestra ese estado (incluyendo closed/passive_discard/rejected)
    leadsQuery = leadsQuery.eq("lead_status", statusFilter);
  } else {
    // Default: excluir estados cerrados
    leadsQuery = leadsQuery
      .neq("lead_status", "closed")
      .neq("lead_status", "passive_discard")
      .neq("lead_status", "rejected");
  }

  if (batchFilter) {
    leadsQuery = leadsQuery.eq("batch_id", batchFilter);
  }

  if (q) {
    leadsQuery = leadsQuery.or(`full_name.ilike.%${q}%,current_company.ilike.%${q}%`);
  }

  const { data: allLeads } = await leadsQuery.order("last_activity_at", { ascending: false });

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

  // Normalizar el campo batch (join anidado) a batch_name string | null para el componente
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leads = (allLeads ?? []).map((l: any) => ({
    ...l,
    batch_name: (l.batch as { name: string } | null)?.name ?? null,
    batch: undefined,
  }));

  return (
    <BandejaClient
      leads={leads}
      awaitingIds={awaitingIds}
      fragmentMap={fragmentMap}
      initialQ={q}
      initialStatus={statusFilter}
      initialBatch={batchFilter}
      batches={batches}
    />
  );
}
