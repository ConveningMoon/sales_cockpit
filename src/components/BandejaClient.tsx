"use client";

import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LeadCard } from "@/components/LeadCard";

type Lead = {
  id: string;
  full_name: string | null;
  current_company: string | null;
  current_position: string | null;
  cs_city: string | null;
  cs_country: string | null;
  last_activity_at: string | null;
  last_inbound_at: string | null;
};

type Props = {
  leads: Lead[];
  awaitingIds: string[];
  fragmentMap: Record<string, string>;
};

export function BandejaClient({ leads, awaitingIds, fragmentMap }: Props) {
  const awaitingSet = new Set(awaitingIds);
  const awaitingLeads = leads.filter((l) => awaitingSet.has(l.id));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur-sm">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-6 h-6 rounded-lg shrink-0"
              style={{ background: "var(--gradient-brand)" }}
            />
            <span className="font-semibold text-sm tracking-tight text-foreground">
              Sales Cockpit
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/batches"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border/50
                         hover:text-foreground hover:border-border transition-colors"
            >
              Batches
            </Link>
            <Link
              href="/leads/new"
              className="rounded-lg px-3.5 py-1.5 text-xs font-semibold text-primary-foreground
                         transition-all duration-150 hover:opacity-90
                         hover:shadow-[0_0_14px_hsl(248_82%_67%/0.35)]"
              style={{ background: "var(--gradient-brand)" }}
            >
              + Nuevo lead
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        <Tabs defaultValue="todos">
          {/* Tabs refinados */}
          <TabsList className="mb-5 bg-muted/60 border border-border/50 p-0.5 h-auto gap-0.5 rounded-lg">
            <TabsTrigger
              value="todos"
              className="flex-1 sm:flex-none text-xs h-7 rounded-md gap-1.5
                         data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:shadow-sm
                         data-[state=inactive]:text-muted-foreground"
            >
              Todos
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {leads.length}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="responder"
              className="flex-1 sm:flex-none text-xs h-7 rounded-md gap-1.5
                         data-[state=active]:bg-secondary data-[state=active]:text-foreground data-[state=active]:shadow-sm
                         data-[state=inactive]:text-muted-foreground"
            >
              Por responder
              {awaitingLeads.length > 0 && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums"
                  style={{
                    background: "var(--gradient-brand)",
                    color: "hsl(248 20% 8%)",
                  }}
                >
                  {awaitingLeads.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="todos" className="mt-0">
            <div className="space-y-2">
              {leads.length === 0 && (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  No hay leads activos. Crea uno con &ldquo;+ Nuevo lead&rdquo;.
                </p>
              )}
              {leads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  id={lead.id}
                  fullName={lead.full_name}
                  currentCompany={lead.current_company}
                  currentPosition={lead.current_position}
                  csCity={lead.cs_city}
                  csCountry={lead.cs_country}
                  lastActivity={lead.last_activity_at}
                  awaiting={awaitingSet.has(lead.id)}
                  fragment={fragmentMap[lead.id]}
                />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="responder" className="mt-0">
            <div className="space-y-2">
              {awaitingLeads.length === 0 && (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  Bandeja vacía — sin leads esperando respuesta.
                </p>
              )}
              {awaitingLeads.map((lead) => (
                <LeadCard
                  key={lead.id}
                  id={lead.id}
                  fullName={lead.full_name}
                  currentCompany={lead.current_company}
                  currentPosition={lead.current_position}
                  csCity={lead.cs_city}
                  csCountry={lead.cs_country}
                  lastActivity={lead.last_inbound_at}
                  awaiting
                  fragment={fragmentMap[lead.id]}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
