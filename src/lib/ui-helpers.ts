// Clases Tailwind para badges semánticos de estado y temperatura.
// Usados en LeadCard (bandeja), LeadProfile (ficha) y StatusSelector.

export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    without_answer:  "bg-zinc-800/80    text-zinc-400    border border-zinc-700/60",
    opener_answered: "bg-indigo-950     text-indigo-300  border border-indigo-800/60",
    fu1_sent:        "bg-blue-950       text-blue-300    border border-blue-800/60",
    fu2_sent:        "bg-sky-950        text-sky-300     border border-sky-800/60",
    in_follow_up:    "bg-violet-950     text-violet-300  border border-violet-800/60",
    interested:      "bg-purple-950     text-purple-300  border border-purple-800/60",
    in_demo:         "bg-green-950      text-green-300   border border-green-800/60",
    in_strategy:     "bg-teal-950       text-teal-300    border border-teal-800/60",
    client:          "bg-emerald-900    text-emerald-200 border border-emerald-700/60",
    closed:          "bg-rose-950       text-rose-400    border border-rose-900/60",
    passive_discard: "bg-zinc-900       text-zinc-500    border border-zinc-800/60",
    rejected:        "bg-zinc-900/60    text-zinc-600    border border-zinc-800/40",
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
    without_answer:  "Without Answer",
    opener_answered: "Opener Answered",
    fu1_sent:        "FU1 Sent",
    fu2_sent:        "FU2 Sent",
    in_follow_up:    "In Follow-up",
    interested:      "Interested",
    in_demo:         "In Demo",
    in_strategy:     "In Strategy",
    client:          "Client",
    closed:          "Closed",
    passive_discard: "Passive Discard",
    rejected:        "Rejected",
  };
  return map[status] ?? status;
}

// ---------------------------------------------------------------------------
// Tracking manual por lead — claves estables en inglés + etiquetas en es-LA.
// Las claves se guardan en DB; las etiquetas solo se renderizan.
// ---------------------------------------------------------------------------

export const CLOSING_REASONS: { key: string; label: string }[] = [
  { key: "not_ready",          label: "No está listo aún" },
  { key: "not_interested",     label: "No interesado" },
  { key: "not_decision_maker", label: "No es decisor" },
  { key: "stopped_responding", label: "Dejó de responder" },
  { key: "not_in_real_estate", label: "No trabaja en RE" },
  { key: "no_time",            label: "No tiene tiempo de responder" },
  { key: "already_has_system", label: "Ya tiene un sistema" },
  { key: "profile_unqualified",label: "Perfil no califica" },
  { key: "thanks_no_progress", label: 'Responde "Gracias" sin avanzar' },
  { key: "price",              label: "Precio" },
  { key: "said_yes_ghosted",   label: "Dijo sí y desapareció" },
  { key: "lost_interest",      label: "Perdió interés" },
  { key: "chose_competitor",   label: "Eligió competidor" },
  { key: "other",              label: "Otro" },
];

export const CLOSING_REASON_KEYS = CLOSING_REASONS.map((r) => r.key);

export function closingReasonLabel(key: string | null): string {
  if (!key) return "Sin razón";
  return CLOSING_REASONS.find((r) => r.key === key)?.label ?? key;
}

export const ANSWER_QUALITIES: { key: string; label: string }[] = [
  { key: "positive", label: "Positiva" },
  { key: "neutral",  label: "Neutra" },
  { key: "negative", label: "Negativa" },
];

export const ANSWER_QUALITY_KEYS = ANSWER_QUALITIES.map((q) => q.key);

export function answerQualityLabel(key: string | null): string {
  if (!key) return "Sin calificar";
  return ANSWER_QUALITIES.find((q) => q.key === key)?.label ?? key;
}

export function answerQualityBadgeClass(key: string): string {
  const map: Record<string, string> = {
    positive: "bg-emerald-900 text-emerald-200 border border-emerald-700/60",
    neutral:  "bg-zinc-800/80  text-zinc-300    border border-zinc-700/60",
    negative: "bg-rose-950     text-rose-400    border border-rose-900/60",
  };
  return map[key] ?? "bg-zinc-800 text-zinc-300 border border-zinc-700";
}

// ---------------------------------------------------------------------------
// Profundidad de conversación manual (5 niveles ordenados, ordinal 1–5)
// ---------------------------------------------------------------------------

export const CONVERSATION_DEPTHS: {
  key: string;
  ordinal: number;
  label: string;
  description: string;
}[] = [
  { key: "responded_once",    ordinal: 1, label: "Responded Once",    description: "Respondió una sola vez con algo sólido (no «gracias» ni genérico)." },
  { key: "basic_exchange",    ordinal: 2, label: "Basic Exchange",     description: "Varios mensajes cortos de ida y vuelta; conversación básica." },
  { key: "deep_conversation", ordinal: 3, label: "Deep Conversation",  description: "Conversación profunda y sostenida." },
  { key: "asks_about_system", ordinal: 4, label: "Asks About System",  description: "Pide explicaciones del sistema y del modo de trabajo." },
  { key: "requests_call",     ordinal: 5, label: "Requests Call",      description: "Pide una llamada o acepta la demo." },
];

export const CONVERSATION_DEPTH_KEYS = CONVERSATION_DEPTHS.map((d) => d.key);

export function conversationDepthLabel(key: string | null): string {
  if (!key) return "Sin registrar";
  return CONVERSATION_DEPTHS.find((d) => d.key === key)?.label ?? key;
}

export function conversationDepthOrdinal(key: string | null): number | null {
  if (!key) return null;
  return CONVERSATION_DEPTHS.find((d) => d.key === key)?.ordinal ?? null;
}

// ---------------------------------------------------------------------------
// Formato de fecha de última actividad — Yekaterinburg (UTC+5), sin hora
// ---------------------------------------------------------------------------
export function formatActivityDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Yekaterinburg",
  }).format(new Date(iso));
}

export function taskTypeLabel(taskType: string): string {
  const map: Record<string, string> = {
    clasificacion:      "Clasificación",
    outreach:           "Secuencia",
    draft:              "Borradores",
    parse_conversation: "Parser de conversación",
    market_data:        "Datos de mercado",
    other:              "Otros",
  };
  return map[taskType] ?? taskType;
}
