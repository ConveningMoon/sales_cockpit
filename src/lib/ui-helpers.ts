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

// ---------------------------------------------------------------------------
// Tracking manual por lead (cero tokens) — claves estables + etiquetas en es-LA.
// Las claves se guardan en DB; las etiquetas solo se renderizan.
// ---------------------------------------------------------------------------

// Razón de cierre. Relevante al marcar perdido/descartado, pero editable siempre.
export const CLOSING_REASONS: { key: string; label: string }[] = [
  { key: "not_ready",          label: "No está listo aún" },
  { key: "not_interested",     label: "No interesado" },
  { key: "not_decision_maker", label: "No es decisor" },
  { key: "went_silent",        label: "Dejó de responder" },
  { key: "not_real_estate",    label: "No trabaja en RE" },
  { key: "no_time",            label: "No tiene tiempo de responder" },
  { key: "has_system",         label: "Ya tiene un sistema" },
  { key: "not_qualified",      label: "Perfil no califica" },
  { key: "thanks_no_progress", label: 'Responde "Gracias" sin avanzar' },
  { key: "price",              label: "Precio" },
  { key: "ghosted_after_yes",  label: "Dijo sí y desapareció" },
  { key: "lost_interest",      label: "Perdió interés" },
  { key: "chose_competitor",   label: "Eligió competidor" },
  { key: "other",              label: "Otro" },
];

export const CLOSING_REASON_KEYS = CLOSING_REASONS.map((r) => r.key);

export function closingReasonLabel(key: string | null): string {
  if (!key) return "Sin razón";
  return CLOSING_REASONS.find((r) => r.key === key)?.label ?? key;
}

// Calidad de la respuesta del lead.
export const ANSWER_QUALITIES: { key: string; label: string }[] = [
  { key: "positiva", label: "Positiva" },
  { key: "neutra",   label: "Neutra" },
  { key: "negativa", label: "Negativa" },
];

export const ANSWER_QUALITY_KEYS = ANSWER_QUALITIES.map((q) => q.key);

export function answerQualityLabel(key: string | null): string {
  if (!key) return "Sin calificar";
  return ANSWER_QUALITIES.find((q) => q.key === key)?.label ?? key;
}

export function answerQualityBadgeClass(key: string): string {
  const map: Record<string, string> = {
    positiva: "bg-emerald-900 text-emerald-200 border border-emerald-700/60",
    neutra:   "bg-zinc-800/80  text-zinc-300    border border-zinc-700/60",
    negativa: "bg-rose-950     text-rose-400    border border-rose-900/60",
  };
  return map[key] ?? "bg-zinc-800 text-zinc-300 border border-zinc-700";
}
