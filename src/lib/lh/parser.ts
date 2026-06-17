import type { LeadInsert } from "@/types/database";

// Subconjunto de campos que provienen del payload de LH2.
// No incluye campos gestionados por la app (cs_group, score, notes, batch_id).
export type Lh2LeadData = Pick<
  LeadInsert,
  | "lh_id"
  | "profile_url"
  | "full_name"
  | "first_name"
  | "last_name"
  | "headline"
  | "summary"
  | "current_company"
  | "current_position"
  | "location_name"
  | "followers"
  | "website"
  | "has_premium"
  | "cs_city"
  | "cs_country"
  | "raw_profile"
>;

export interface Lh2MessageData {
  direction: "inbound" | "outbound";
  body: string;
  sent_at: string;
}

export interface ParsedLh2Webhook {
  lead: Lh2LeadData;
  messages: Lh2MessageData[];
}

export function parseLh2Payload(body: Record<string, unknown>): ParsedLh2Webhook {
  const lh_id = strOrNull(body.lh_id);
  if (!lh_id) throw new Error("Campo lh_id ausente o vacío — no se puede identificar el lead.");

  const rawFollowers = parseInt(String(body.followers ?? ""), 10);

  const lead: Lh2LeadData = {
    lh_id,
    profile_url: strOrNull(body.profile_url),
    full_name: strOrNull(body.full_name),
    first_name: strOrNull(body.first_name),
    last_name: strOrNull(body.last_name),
    headline: strOrNull(body.headline),
    summary: strOrNull(body.summary),
    current_company: strOrNull(body.current_company),
    // LH2 llama "current_company_position" a lo que la tabla llama "current_position"
    current_position: strOrNull(body.current_company_position),
    location_name: strOrNull(body.location_name),
    followers: Number.isNaN(rawFollowers) ? null : rawFollowers,
    website: strOrNull(body.website_1),
    // LH2 envía "true"/"false" como string
    has_premium: body.badges_premium === "true",
    cs_city: strOrNull(body.cs_city),
    cs_country: strOrNull(body.cs_country),
    // Payload completo — incluye email, avatar, campaign_name, cs_parrafo_mercado, etc.
    raw_profile: body,
  };

  const messages: Lh2MessageData[] = [];

  // Último mensaje de Dylan al lead (outbound).
  // "last_received_message" = recibido por el lead = enviado por Dylan.
  const outboundBody = strOrNull(body.last_received_message_text);
  const outboundAt = strOrNull(body.last_received_message_send_at_iso);
  if (outboundBody && outboundAt) {
    messages.push({ direction: "outbound", body: outboundBody, sent_at: outboundAt });
  }

  // Respuesta del lead que disparó el webhook (inbound).
  // Ancla en replied_message_1_text, no en last_sent_message_text (nombre ambiguo).
  const inboundBody = strOrNull(body.replied_message_1_text);
  const inboundAt = strOrNull(body.replied_message_1_send_at_iso);
  if (!inboundBody) {
    throw new Error("Campo replied_message_1_text ausente — ¿el lead respondió realmente?");
  }
  if (!inboundAt) {
    throw new Error("Campo replied_message_1_send_at_iso ausente — no se puede determinar el timestamp.");
  }
  messages.push({ direction: "inbound", body: inboundBody, sent_at: inboundAt });

  return { lead, messages };
}

function strOrNull(v: unknown): string | null {
  if (v == null || v === "") return null;
  return String(v);
}
