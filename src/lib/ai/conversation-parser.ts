import { callAI } from "./router";

export interface RawParsedMessage {
  direction: "inbound" | "outbound";
  body: string;
  timestamp_raw: string;
}

export interface TimestampedMessage extends RawParsedMessage {
  sent_at: string; // ISO, estrictamente creciente
}

// ---------------------------------------------------------------------------
// Parseo con Haiku
// ---------------------------------------------------------------------------

export async function parseConversation(params: {
  rawText: string;
  leadName: string;
  myName: string;
  leadId?: string;
}): Promise<RawParsedMessage[]> {
  const { rawText, leadName, myName, leadId } = params;

  const systemPrompt =
    "Eres un parser de conversaciones de LinkedIn. " +
    "Devuelves exclusivamente JSON válido, sin markdown, sin explicaciones.";

  const userMessage =
    `Lead: ${leadName}\n` +
    `Mi nombre en LinkedIn: ${myName}\n\n` +
    `Texto de la conversación:\n${rawText}\n\n` +
    `Devuelve un array JSON con exactamente este formato:\n` +
    `[{"direction":"inbound"|"outbound","body":"...","timestamp_raw":"..."}]\n\n` +
    `Reglas:\n` +
    `- direction="outbound" → mensajes de ${myName}\n` +
    `- direction="inbound"  → mensajes de ${leadName}\n` +
    `- Ignora: "View X's profile", "sent the following messages at", ` +
    `líneas que solo son un nombre, "You sent", "Seen", marcas de tiempo aisladas\n` +
    `- body: texto limpio del mensaje (sin metadatos ni nombres de encabezado)\n` +
    `- timestamp_raw: fecha/hora tal como aparece ("Apr 20", "Wednesday 3:04 PM"), ` +
    `o "" si no hay fecha asociada a este mensaje específico\n` +
    `- Orden: de más antiguo a más reciente (cronológico)\n` +
    `- Solo incluye mensajes con body no vacío`;

  const result = await callAI({
    taskType: "parse_conversation",
    systemPrompt,
    userMessage,
    leadId,
    maxTokens: 2048,
  });

  return parseJsonOutput(result.content);
}

function parseJsonOutput(raw: string): RawParsedMessage[] {
  let cleaned = raw.trim();

  // Strip markdown fences (```json...``` o ```...```)
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `[conversation-parser] JSON inválido del modelo: ${cleaned.slice(0, 300)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("[conversation-parser] La respuesta no es un array JSON.");
  }

  const messages: RawParsedMessage[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const obj = item as Record<string, unknown>;

    const dir = obj.direction;
    if (dir !== "inbound" && dir !== "outbound") continue;

    const body = typeof obj.body === "string" ? obj.body.trim() : "";
    if (!body) continue;

    const timestamp_raw =
      typeof obj.timestamp_raw === "string" ? obj.timestamp_raw : "";

    messages.push({ direction: dir, body, timestamp_raw });
  }

  return messages;
}

// ---------------------------------------------------------------------------
// Asignación de timestamps
//
// El ORDEN del array es la fuente de verdad, no los timestamps.
// Estrategia por mensaje:
//   candidate = timestamp parseado si confiable, si no → prev + 1 min
//   sent_at   = max(candidate, prev + 1s)   ← monotonía estricta garantizada
// El gap sintético se ancla al mensaje anterior, nunca a now() de forma independiente,
// para que no se intercale fuera de orden con fechas reales.
// ---------------------------------------------------------------------------

export function assignTimestamps(
  messages: RawParsedMessage[],
  now = new Date()
): TimestampedMessage[] {
  if (messages.length === 0) return [];

  const ONE_MIN_MS = 60_000;
  const ONE_SEC_MS = 1_000;

  // Punto de partida: suficientemente en el pasado para que todos los mensajes
  // queden antes de now() aunque no tengan timestamp propio.
  let prevMs = now.getTime() - messages.length * ONE_MIN_MS;

  return messages.map((msg) => {
    const parsed = tryParseTimestamp(msg.timestamp_raw, now);
    const candidateMs = parsed !== null ? parsed : prevMs + ONE_MIN_MS;
    const sentMs = Math.max(candidateMs, prevMs + ONE_SEC_MS);

    prevMs = sentMs;
    return { ...msg, sent_at: new Date(sentMs).toISOString() };
  });
}

// Intenta parsear formatos comunes de LinkedIn. Devuelve ms o null.
function tryParseTimestamp(raw: string, now: Date): number | null {
  const s = raw?.trim();
  if (!s) return null;

  const nowMs = now.getTime();
  const ONE_DAY_MS = 86_400_000;
  const TEN_YEARS_MS = 10 * 365 * ONE_DAY_MS;

  // 1. Parseo directo (maneja "April 21, 2025", "Apr 20, 2024 3:04 PM", etc.)
  const direct = Date.parse(s);
  if (!isNaN(direct)) {
    if (direct >= nowMs - TEN_YEARS_MS && direct <= nowMs + ONE_DAY_MS) {
      return direct;
    }
  }

  const currentYear = now.getFullYear();

  // 2. "Apr 20" / "April 20" sin año
  const monthDay = s.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\b.*)?$/i
  );
  if (monthDay) {
    const attempt = Date.parse(`${monthDay[1]} ${monthDay[2]}, ${currentYear}`);
    if (!isNaN(attempt)) {
      // Si la fecha cae en el futuro, usar el año anterior
      return attempt > nowMs ? attempt - 365 * ONE_DAY_MS : attempt;
    }
  }

  // 3. Nombre del día de la semana ("Wednesday", "Wednesday 3:04 PM")
  const weekdays = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayMatch = s.match(
    /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (dayMatch) {
    const target = weekdays.indexOf(dayMatch[1].toLowerCase());
    const d = new Date(now);
    // Retroceder hasta el día de la semana buscado (máximo 6 días atrás)
    while (d.getDay() !== target) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  // 4. "Yesterday"
  if (/^yesterday\b/i.test(s)) return nowMs - ONE_DAY_MS;

  // 5. "Today" o solo hora "3:04 PM"
  if (/^today\b/i.test(s) || /^\d{1,2}:\d{2}/.test(s)) return nowMs;

  return null;
}

// ---------------------------------------------------------------------------
// Normalización para dedup app-level
// ---------------------------------------------------------------------------
export function normalizeBody(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
