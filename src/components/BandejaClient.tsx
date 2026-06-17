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
      <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center justify-between">
          <h1 className="font-semibold text-base">ITMANO Sales Cockpit</h1>
          <Link
            href="/leads/new"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + Nuevo lead
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-4">
        <Tabs defaultValue="todos">
          <TabsList className="mb-4 w-full sm:w-auto">
            <TabsTrigger value="todos" className="flex-1 sm:flex-none">
              Todos ({leads.length})
            </TabsTrigger>
            <TabsTrigger value="responder" className="flex-1 sm:flex-none">
              Por responder ({awaitingLeads.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="todos">
            <div className="space-y-2">
              {leads.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
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

          <TabsContent value="responder">
            <div className="space-y-2">
              {awaitingLeads.length === 0 && (
                <p className="text-sm text-muted-foreground py-8 text-center">
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
