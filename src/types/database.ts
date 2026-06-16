// Tipos derivados del esquema Supabase (supabase/migrations/001_sales_cockpit_schema.sql)
// Generados manualmente. Cuando el CLI esté configurado se pueden regenerar con:
//   supabase gen types typescript --linked

export type LeadStatus =
  | "nuevo"
  | "contactado"
  | "respondio"
  | "en_conversacion"
  | "demo_agendada"
  | "estrategia_agendada"
  | "cliente"
  | "perdido"
  | "descartado";

export type CsGroup = "A" | "B" | "NO_ESCRIBIR";
export type MessageDirection = "inbound" | "outbound";
export type MessageSource = "webhook" | "manual_paste" | "draft_sent" | "import";
export type DraftStatus = "pending" | "edited" | "sent" | "discarded";
export type DraftTrigger = "webhook" | "manual";
export type OutreachKind = "cold" | "fu1" | "fu2";
export type FollowupStage = "fu1" | "fu2" | "custom";
export type AiTaskType = "clasificacion" | "market_data" | "outreach" | "draft" | "other";

export interface Lead {
  id: string;
  lh_id: string | null;
  profile_url: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  headline: string | null;
  summary: string | null;
  current_company: string | null;
  current_position: string | null;
  location_name: string | null;
  followers: number | null;
  website: string | null;
  has_premium: boolean;
  languages: string[] | null;
  cs_group: CsGroup | null;
  cs_city: string | null;
  cs_country: string | null;
  lead_status: LeadStatus;
  score: number | null;
  batch_id: string | null;
  notes: string | null;
  raw_profile: Record<string, unknown> | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadInsert = Omit<
  Lead,
  "id" | "created_at" | "updated_at" | "last_inbound_at" | "last_outbound_at" | "last_activity_at"
>;

export interface Message {
  id: string;
  lead_id: string;
  direction: MessageDirection;
  body: string;
  channel: string;
  source: MessageSource;
  sent_at: string;
  created_at: string;
}

export type MessageInsert = Omit<Message, "id" | "created_at">;

export interface Draft {
  id: string;
  lead_id: string;
  in_reply_to_msg_id: string | null;
  body: string;
  model: string | null;
  trigger: DraftTrigger | null;
  status: DraftStatus;
  generated_at: string;
  sent_at: string | null;
}

export type DraftInsert = Omit<Draft, "id" | "generated_at">;

export interface OutreachSequence {
  id: string;
  lead_id: string;
  kind: OutreachKind;
  body: string;
  char_count: number | null;
  model: string | null;
  generated_at: string;
}

export type OutreachSequenceInsert = Omit<OutreachSequence, "id" | "generated_at">;

export interface MarketData {
  id: string;
  country: string;
  city: string | null;
  stat: string;
  common_problem: string;
  source_note: string | null;
  model: string | null;
  raw: Record<string, unknown> | null;
  generated_at: string;
  expires_at: string | null;
}

export type MarketDataInsert = Omit<MarketData, "id" | "generated_at">;

export interface Batch {
  id: string;
  name: string;
  source: string | null;
  lead_count: number;
  imported_at: string;
}

export type BatchInsert = Omit<Batch, "id" | "imported_at">;

export interface Followup {
  id: string;
  lead_id: string;
  stage: FollowupStage;
  due_at: string;
  done: boolean;
  done_at: string | null;
  note: string | null;
  created_at: string;
}

export type FollowupInsert = Omit<Followup, "id" | "created_at">;

export interface AiUsage {
  id: string;
  task_type: AiTaskType;
  model: string;
  provider: string | null;
  lead_id: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cost_usd: number | null;
  created_at: string;
}

export type AiUsageInsert = Omit<AiUsage, "id" | "created_at">;

// Tipos para las vistas
export interface LeadAwaitingReply extends Lead {
  pending_draft: string | null;
}

export interface FollowupDue extends Followup {
  full_name: string | null;
  profile_url: string | null;
}

export interface AiSpendMonthly {
  month: string;
  task_type: AiTaskType;
  calls: number;
  cost_usd: number | null;
}

// Tipo para el cliente Supabase tipado
export interface Database {
  public: {
    Tables: {
      leads: { Row: Lead; Insert: LeadInsert; Update: Partial<LeadInsert> };
      messages: { Row: Message; Insert: MessageInsert; Update: Partial<MessageInsert> };
      drafts: { Row: Draft; Insert: DraftInsert; Update: Partial<DraftInsert> };
      outreach_sequence: { Row: OutreachSequence; Insert: OutreachSequenceInsert; Update: Partial<OutreachSequenceInsert> };
      market_data: { Row: MarketData; Insert: MarketDataInsert; Update: Partial<MarketDataInsert> };
      batches: { Row: Batch; Insert: BatchInsert; Update: Partial<BatchInsert> };
      followups: { Row: Followup; Insert: FollowupInsert; Update: Partial<FollowupInsert> };
      ai_usage: { Row: AiUsage; Insert: AiUsageInsert; Update: Partial<AiUsageInsert> };
    };
    Views: {
      leads_awaiting_reply: { Row: LeadAwaitingReply };
      followups_due: { Row: FollowupDue };
      ai_spend_monthly: { Row: AiSpendMonthly };
    };
  };
}
