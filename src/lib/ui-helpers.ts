// Clases Tailwind para badges semánticos de estado y temperatura.
// Usados en LeadCard (bandeja), LeadProfile (ficha) y StatusSelector.

export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    nuevo:               "bg-zinc-800/80    text-zinc-300    border border-zinc-700/60",
    contactado:          "bg-blue-950       text-blue-300    border border-blue-800/60",
    respondio:           "bg-indigo-950     text-indigo-300  border border-indigo-800/60",
    en_conversacion:     "bg-violet-950     text-violet-300  border border-violet-800/60",
    demo_agendada:       "bg-green-950      text-green-300   border border-green-800/60",
    estrategia_agendada: "bg-teal-950       text-teal-300    border border-teal-800/60",
    cliente:             "bg-emerald-900    text-emerald-200 border border-emerald-700/60",
    perdido:             "bg-rose-950       text-rose-400    border border-rose-900/60",
    descartado:          "bg-zinc-900       text-zinc-600    border border-zinc-800/60",
  };
  return map[status] ?? "bg-zinc-800 text-zinc-300 border border-zinc-700";
}

export function groupBadgeClass(group: string): string {
  const map: Record<string, string> = {
    A:           "bg-amber-950  text-amber-400  border border-amber-800/60",
    B:           "bg-indigo-950 text-indigo-400 border border-indigo-800/60",
    NO_ESCRIBIR: "bg-zinc-900   text-zinc-600   border border-zinc-800/60",
  };
  return map[group] ?? "bg-zinc-900 text-zinc-500 border border-zinc-800";
}

export function statusLabel(status: string): string {
  const map: Record<string, string> = {
    nuevo:               "Nuevo",
    contactado:          "Contactado",
    respondio:           "Respondió",
    en_conversacion:     "En conversación",
    demo_agendada:       "Demo agendada",
    estrategia_agendada: "Estrategia agendada",
    cliente:             "Cliente",
    perdido:             "Perdido",
    descartado:          "Descartado",
  };
  return map[status] ?? status;
}
