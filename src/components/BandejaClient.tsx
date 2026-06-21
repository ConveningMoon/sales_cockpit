"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { LeadCard } from "@/components/LeadCard";
import { statusLabel } from "@/lib/ui-helpers";

const PIPELINE_STATUSES = [
  "without_answer", "opener_answered", "fu1_sent", "fu2_sent",
  "in_follow_up", "interested", "in_demo", "in_strategy", "client",
] as const;

const CLOSED_STATUSES = ["closed", "passive_discard", "rejected"] as const;

type Lead = {
  id: string;
  full_name: string | null;
  current_company: string | null;
  current_position: string | null;
  cs_city: string | null;
  cs_country: string | null;
  lead_status: string;
  batch_name: string | null;
  last_activity_at: string | null;
  last_inbound_at: string | null;
};

type Props = {
  leads: Lead[];
  awaitingIds: string[];
  fragmentMap: Record<string, string>;
  initialQ: string;
  initialStatus: string;
};

export function BandejaClient({ leads, awaitingIds, fragmentMap, initialQ, initialStatus }: Props) {
  const router = useRouter();
  const awaitingSet = new Set(awaitingIds);
  const awaitingLeads = leads.filter((l) => awaitingSet.has(l.id));

  const [inputValue, setInputValue] = useState(initialQ);
  const [selectedStatus, setSelectedStatus] = useState(initialStatus);
  const isFirstRender = useRef(true);

  function pushUrl(q: string, status: string) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/", { scroll: false });
  }

  // Debounce la búsqueda de texto — evita push en el primer render
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const id = setTimeout(() => {
      pushUrl(inputValue.trim(), selectedStatus);
    }, 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  function handleStatusChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value;
    setSelectedStatus(next);
    pushUrl(inputValue.trim(), next); // inmediato para el filtro de estado
  }

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
        {/* Search + filtro de estado */}
        <div className="flex gap-2 mb-4">
          {/* Input de búsqueda */}
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none"
              fill="none" stroke="currentColor" strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Buscar por nombre o empresa…"
              className={[
                "w-full h-8 pl-8 pr-3 rounded-lg border border-border/40 text-xs",
                "bg-background/50 text-foreground placeholder:text-muted-foreground/40",
                "focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40",
                "transition-colors",
              ].join(" ")}
            />
          </div>

          {/* Filtro de estado */}
          <select
            value={selectedStatus}
            onChange={handleStatusChange}
            className={[
              "h-8 rounded-lg border border-border/40 px-2 text-xs shrink-0",
              "bg-background/50 text-foreground",
              "focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40",
              "hover:border-border/70 transition-colors cursor-pointer",
            ].join(" ")}
            style={{ colorScheme: "dark" }}
          >
            <option value="">All statuses</option>
            <optgroup label="── Pipeline ──">
              {PIPELINE_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </optgroup>
            <optgroup label="── Closed ──">
              {CLOSED_STATUSES.map((s) => (
                <option key={s} value={s}>{statusLabel(s)}</option>
              ))}
            </optgroup>
          </select>
        </div>

        <Tabs defaultValue="todos">
          {/* Tabs */}
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
                  {inputValue || selectedStatus
                    ? "Sin resultados para esta búsqueda."
                    : 'No hay leads activos. Crea uno con "+ Nuevo lead".'}
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
                  leadStatus={lead.lead_status}
                  batchName={lead.batch_name}
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
                  leadStatus={lead.lead_status}
                  batchName={lead.batch_name}
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
