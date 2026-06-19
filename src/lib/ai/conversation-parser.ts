// Parser determinista de conversaciones de LinkedIn.
// Sin llamadas a IA — función pura segura para uso en cliente y servidor.

export interface RawParsedMessage {
  direction: "inbound" | "outbound";
  body: string;
  timestamp_raw: string; // string combinado "May 13 2:08 PM", "Monday 6:24 PM", etc.
}

export interface TimestampedMessage extends RawParsedMessage {
  sent_at: string; // ISO, estrictamente creciente — calculado en el servidor
}

// ---------------------------------------------------------------------------
// Parser determinista (cliente-side)
// ---------------------------------------------------------------------------

// Extrae mensajes estructurados del texto pegado desde LinkedIn.
// Orden de evaluación por línea: ruido → cabecera de fecha → ancla → cuerpo.
export function parseConversationText(
  text: string,
  myName: string
): RawParsedMessage[] {
  const normMy = normalizeName(myName);

  const messages: RawParsedMessage[] = [];
  let currentDate = "";
  let currentMsg: {
    direction: "inbound" | "outbound";
    lines: string[];
    timestamp_raw: string;
  } | null = null;

  function flush() {
    if (!currentMsg) return;
    const body = currentMsg.lines.join("\n").trim();
    if (body) {
      messages.push({
        direction: currentMsg.direction,
        body,
        timestamp_raw: currentMsg.timestamp_raw,
      });
    }
    currentMsg = null;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    // 1. Ruido — evaluado primero para excluir líneas estructurales de LH2
    if (/sent the following messages? at/i.test(trimmed)) continue;
    if (/^view .+[‘’']s profile/i.test(trimmed)) continue; // curvo y recto
    if (/^seen by .+ at/i.test(trimmed)) continue;

    // 2. Cabecera de fecha (actualiza currentDate, finaliza mensaje anterior)
    if (isDateHeader(trimmed)) {
      flush();
      currentDate = trimmed;
      continue;
    }

    // 3. Ancla por mensaje: <nombre>  <hora> — solo si el nombre coincide
    const anchor = tryParseAnchor(trimmed, normMy);
    if (anchor) {
      flush();
      const timestamp_raw = currentDate
        ? `${currentDate} ${anchor.time}`
        : anchor.time;
      currentMsg = { direction: anchor.direction, lines: [], timestamp_raw };
      continue;
    }

    // 4. Cuerpo (línea pertenece al mensaje actual, preservando estructura original)
    if (currentMsg) currentMsg.lines.push(line);
  }

  flush();
  return messages;
}

function isDateHeader(s: string): boolean {
  if (!s) return false;
  if (/^(today|yesterday)$/i.test(s)) return true;
  if (/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i.test(s))
    return true;
  // "Apr 22", "May 5", "January 15" — mes + día sin hora
  if (/^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}$/i.test(s))
    return true;
  return false;
}

function tryParseAnchor(
  line: string,
  normMy: string
): { direction: "inbound" | "outbound"; time: string } | null {
  // Patrón estricto: <nombre>  <hora AM/PM al final de línea>
  // El AM/PM obligatorio al final ya protege contra falsos positivos en el cuerpo.
  const match = line.match(/^(.+?)\s{2,}(\d{1,2}:\d{2}\s*(?:AM|PM))\s*$/i);
  if (!match) return null;

  const anchorName = normalizeName(match[1]);
  const time = match[2].trim();

  // En un hilo 1:1 solo hay dos interlocutores: si el nombre es mío → outbound;
  // cualquier otro nombre válido es el lead → inbound.
  // No se depende de matchear el nombre exacto del lead (evita fallos por acentos
  // o diferencias entre lo que guarda LH2 y lo que muestra LinkedIn).
  if (anchorName === normMy) return { direction: "outbound", time };
  return { direction: "inbound", time };
}

function normalizeName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // elimina marcas de acento
    .replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Resolución de timestamps (servidor)
// El cliente emite timestamp_raw; el servidor resuelve a sent_at con su propio now().
// ---------------------------------------------------------------------------

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const ONE_DAY_MS = 86_400_000;
const TEN_YEARS_MS = 10 * 365 * ONE_DAY_MS;

// Asigna sent_at ISO estrictamente creciente.
// El orden del array es la fuente de verdad — la precisión del timestamp es best-effort.
// Clamp: sent_at = max(candidate, prev + 1s) garantiza monotonía sin anclar a now().
export function assignTimestamps(
  messages: RawParsedMessage[],
  now = new Date()
): TimestampedMessage[] {
  if (messages.length === 0) return [];

  const ONE_MIN_MS = 60_000;
  const ONE_SEC_MS = 1_000;
  let prevMs = now.getTime() - messages.length * ONE_MIN_MS;

  return messages.map((msg) => {
    const parsed = tryParseTimestamp(msg.timestamp_raw, now);
    const candidateMs = parsed !== null ? parsed : prevMs + ONE_MIN_MS;
    const sentMs = Math.max(candidateMs, prevMs + ONE_SEC_MS);
    prevMs = sentMs;
    return { ...msg, sent_at: new Date(sentMs).toISOString() };
  });
}

// Parsea formatos de timestamp_raw producidos por el cliente.
// Usa el year dinámico; si la fecha resuelta queda en el futuro resta un año.
// Formatos soportados: "May 13 2:08 PM", "Monday 6:24 PM", "Today 8:43 AM",
// "Yesterday 5:00 PM", "Apr 22", "Monday", "Today", "Yesterday", ISO completo.
function tryParseTimestamp(raw: string, now: Date): number | null {
  const s = raw?.trim();
  if (!s) return null;

  const nowMs = now.getTime();
  const currentYear = now.getFullYear();

  // 1. "Today 8:43 AM" / "Yesterday 5:00 PM" (relativo + hora)
  const relTimeMatch = s.match(/^(today|yesterday)\s+(.+)$/i);
  if (relTimeMatch) {
    const base = /^today/i.test(s)
      ? new Date(now)
      : new Date(nowMs - ONE_DAY_MS);
    const attempt = Date.parse(`${base.toDateString()} ${relTimeMatch[2]}`);
    return !isNaN(attempt) ? attempt : base.getTime();
  }

  // 2. "Today" / "Yesterday" (solo relativo, sin hora)
  if (/^today$/i.test(s)) return nowMs;
  if (/^yesterday$/i.test(s)) return nowMs - ONE_DAY_MS;

  // 3. "Monday 6:24 PM" / "Tuesday 2:16 PM" (nombre de día + hora)
  const dayTimeMatch = s.match(
    /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\s+(.+)$/i
  );
  if (dayTimeMatch) {
    const target = WEEKDAYS.indexOf(dayTimeMatch[1].toLowerCase());
    const d = new Date(now);
    while (d.getDay() !== target) d.setDate(d.getDate() - 1);
    const attempt = Date.parse(`${d.toDateString()} ${dayTimeMatch[2]}`);
    return !isNaN(attempt) ? attempt : d.getTime();
  }

  // 4. "Monday" / "Tuesday" (solo nombre de día)
  const dayOnlyMatch = s.match(
    /^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/i
  );
  if (dayOnlyMatch) {
    const target = WEEKDAYS.indexOf(dayOnlyMatch[1].toLowerCase());
    const d = new Date(now);
    while (d.getDay() !== target) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  // 5. "Apr 22 1:40 PM" / "May 13 2:08 PM" (mes + día + hora)
  const monthDayTimeMatch = s.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})\s+(.+)$/i
  );
  if (monthDayTimeMatch) {
    let ms = Date.parse(
      `${monthDayTimeMatch[1]} ${monthDayTimeMatch[2]}, ${currentYear} ${monthDayTimeMatch[3]}`
    );
    if (!isNaN(ms)) {
      if (ms > nowMs)
        ms = Date.parse(
          `${monthDayTimeMatch[1]} ${monthDayTimeMatch[2]}, ${currentYear - 1} ${monthDayTimeMatch[3]}`
        );
      return isNaN(ms) ? null : ms;
    }
  }

  // 6. "Apr 22" / "May 13" (mes + día sin hora)
  const monthDayMatch = s.match(
    /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{1,2})$/i
  );
  if (monthDayMatch) {
    let ms = Date.parse(
      `${monthDayMatch[1]} ${monthDayMatch[2]}, ${currentYear}`
    );
    if (!isNaN(ms)) {
      if (ms > nowMs)
        ms = Date.parse(
          `${monthDayMatch[1]} ${monthDayMatch[2]}, ${currentYear - 1}`
        );
      return isNaN(ms) ? null : ms;
    }
  }

  // 7. Parseo directo (ISO, fecha completa con año, etc.)
  const direct = Date.parse(s);
  if (!isNaN(direct) && direct >= nowMs - TEN_YEARS_MS && direct <= nowMs + ONE_DAY_MS) {
    return direct;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Normalización para dedup app-level (servidor)
// ---------------------------------------------------------------------------
export function normalizeBody(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}
