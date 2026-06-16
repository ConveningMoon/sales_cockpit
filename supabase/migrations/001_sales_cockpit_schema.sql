-- =============================================================================
-- ITMANO Sales Cockpit  ·  Esquema inicial (migracion 001)
-- PostgreSQL / Supabase  ·  herramienta interna de un solo usuario
-- Convencion: identificadores en ingles; estados de pipeline y comentarios en
-- espanol neutro latino. Ajusta los valores de lead_status a tu gusto.
-- =============================================================================

-- Extensiones -----------------------------------------------------------------
create extension if not exists "pgcrypto";   -- habilita gen_random_uuid()

-- Utilidad: refrescar updated_at en cada UPDATE -------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =============================================================================
-- batches  ·  cada importacion de un CSV scrapeado desde Linked Helper
-- =============================================================================
create table batches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  source      text,                              -- p.ej. nombre de la campana en LH2
  lead_count  integer not null default 0,
  imported_at timestamptz not null default now()
);

-- =============================================================================
-- market_data  ·  dato de mercado CACHEADO por geografia (matiz 1)
-- Se inyecta como CONTEXTO en la generacion por lead; nunca se envia tal cual.
-- Asi obtienes la estadistica de autoridad sin repetir busquedas web.
-- =============================================================================
create table market_data (
  id             uuid primary key default gen_random_uuid(),
  country        text not null,
  city           text,                            -- null = dato a nivel pais
  stat           text not null,                   -- estadistica verificable
  common_problem text not null,                   -- dolor comun del mercado
  source_note    text,                            -- de donde salio el dato
  model          text,
  raw            jsonb,
  generated_at   timestamptz not null default now(),
  expires_at     timestamptz,                     -- para detectar dato viejo
  unique (country, city)
);

create index market_data_country_idx on market_data (country);

-- =============================================================================
-- leads  ·  entidad central
-- =============================================================================
create table leads (
  id               uuid primary key default gen_random_uuid(),

  -- Identidad / dedup
  lh_id            text unique,                   -- id de Linked Helper (clave de upsert)
  profile_url      text,
  full_name        text,
  first_name       text,
  last_name        text,

  -- Perfil scrapeado
  headline         text,
  summary          text,
  current_company  text,
  current_position text,
  location_name    text,                          -- crudo, tal como llega de LH2
  followers        integer,
  website          text,
  has_premium      boolean default false,
  languages        text[],

  -- Derivados de la clasificacion (prompt_clasificacion_leads)
  cs_group         text check (cs_group in ('A','B','NO_ESCRIBIR')),
  cs_city          text,
  cs_country       text,

  -- Estado comercial (pipeline de prospeccion B2B)
  lead_status      text not null default 'nuevo'
                   check (lead_status in (
                     'nuevo','contactado','respondio','en_conversacion',
                     'demo_agendada','estrategia_agendada',
                     'cliente','perdido','descartado')),
  score            integer check (score between 0 and 100),

  -- Metadata
  batch_id         uuid references batches(id) on delete set null,
  notes            text,
  raw_profile      jsonb,                          -- payload completo de LH2 (campos variables)

  -- Marcas de tiempo de actividad (mantenidas por trigger)
  last_inbound_at  timestamptz,
  last_outbound_at timestamptz,
  last_activity_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index leads_status_idx   on leads (lead_status);
create index leads_country_idx  on leads (cs_country);
create index leads_group_idx    on leads (cs_group);
create index leads_activity_idx on leads (last_activity_at desc);

create trigger leads_set_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- =============================================================================
-- messages  ·  hilo de conversacion (fuente de verdad)
-- inbound = del lead (webhook o pegado manual); outbound = lo que tu enviaste
-- =============================================================================
create table messages (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  direction  text not null check (direction in ('inbound','outbound')),
  body       text not null,
  channel    text not null default 'linkedin',
  source     text not null default 'webhook'
             check (source in ('webhook','manual_paste','draft_sent','import')),
  sent_at    timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index messages_lead_idx on messages (lead_id, sent_at);

-- Mantener last_*_at del lead al insertar un mensaje
create or replace function touch_lead_activity()
returns trigger language plpgsql as $$
begin
  update leads set
    last_activity_at = greatest(coalesce(last_activity_at, new.sent_at), new.sent_at),
    last_inbound_at  = case when new.direction = 'inbound'
                            then greatest(coalesce(last_inbound_at,  new.sent_at), new.sent_at)
                            else last_inbound_at  end,
    last_outbound_at = case when new.direction = 'outbound'
                            then greatest(coalesce(last_outbound_at, new.sent_at), new.sent_at)
                            else last_outbound_at end
  where id = new.lead_id;
  return new;
end;
$$;

create trigger messages_touch_lead
  after insert on messages
  for each row execute function touch_lead_activity();

-- =============================================================================
-- drafts  ·  respuestas generadas por IA (auto-borrador)
-- Se genera al ingerir un inbound (webhook) o al pegar un turno manual.
-- =============================================================================
create table drafts (
  id                 uuid primary key default gen_random_uuid(),
  lead_id            uuid not null references leads(id) on delete cascade,
  in_reply_to_msg_id uuid references messages(id) on delete set null,
  body               text not null,
  model              text,
  trigger            text check (trigger in ('webhook','manual')),
  status             text not null default 'pending'
                     check (status in ('pending','edited','sent','discarded')),
  generated_at       timestamptz not null default now(),
  sent_at            timestamptz
);

create index drafts_lead_idx   on drafts (lead_id);
create index drafts_pending_idx on drafts (status) where status = 'pending';

-- =============================================================================
-- outreach_sequence  ·  los 3 mensajes pre-generados POR LEAD (cold/fu1/fu2)
-- Alimenta el export de CSV: columnas cs_msg_cold / cs_msg_fu1 / cs_msg_fu2
-- =============================================================================
create table outreach_sequence (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references leads(id) on delete cascade,
  kind         text not null check (kind in ('cold','fu1','fu2')),
  body         text not null,
  char_count   integer,
  model        text,
  generated_at timestamptz not null default now(),
  unique (lead_id, kind)
);

-- =============================================================================
-- followups  ·  recordatorios de cadencia (3 dias / 5 dias / manual)
-- =============================================================================
create table followups (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  stage      text not null check (stage in ('fu1','fu2','custom')),
  due_at     timestamptz not null,
  done       boolean not null default false,
  done_at    timestamptz,
  note       text,
  created_at timestamptz not null default now()
);

create index followups_due_idx on followups (due_at) where done = false;

-- =============================================================================
-- ai_usage  ·  libro de gasto de IA (TODAS las llamadas, por modelo y tarea)
-- Una sola fuente de verdad del costo, para tu objetivo de economizar.
-- =============================================================================
create table ai_usage (
  id            uuid primary key default gen_random_uuid(),
  task_type     text not null check (task_type in
                  ('clasificacion','market_data','outreach','draft','other')),
  model         text not null,
  provider      text,                              -- anthropic / openrouter / deepseek / etc.
  lead_id       uuid references leads(id) on delete set null,
  input_tokens  integer,
  output_tokens integer,
  cached_tokens integer,
  cost_usd      numeric(10,5),
  created_at    timestamptz not null default now()
);

create index ai_usage_task_idx    on ai_usage (task_type, created_at);
create index ai_usage_created_idx on ai_usage (created_at);

-- =============================================================================
-- VISTAS de conveniencia para el cockpit
-- =============================================================================

-- Bandeja: leads cuyo ultimo mensaje es inbound y aun no respondiste
create view leads_awaiting_reply as
select l.*,
       (select d.body from drafts d
         where d.lead_id = l.id and d.status = 'pending'
         order by d.generated_at desc limit 1) as pending_draft
from leads l
where l.last_inbound_at is not null
  and (l.last_outbound_at is null or l.last_inbound_at > l.last_outbound_at)
  and l.lead_status not in ('cliente','perdido','descartado');

-- Follow-ups vencidos
create view followups_due as
select f.*, l.full_name, l.profile_url
from followups f
join leads l on l.id = f.lead_id
where f.done = false and f.due_at <= now();

-- Gasto de IA agregado por mes y tarea
create view ai_spend_monthly as
select date_trunc('month', created_at) as month,
       task_type,
       count(*)      as calls,
       sum(cost_usd) as cost_usd
from ai_usage
group by 1, 2
order by 1 desc, 2;

-- =============================================================================
-- RLS (OPCIONAL)  ·  para un solo usuario no es necesario.
-- El backend usa la service key; el cockpit es el unico cliente. Si quieres
-- defensa en profundidad, descomenta y agrega una politica permisiva por tabla.
-- =============================================================================
-- alter table leads enable row level security;
-- create policy "owner_all" on leads for all to authenticated using (true) with check (true);
