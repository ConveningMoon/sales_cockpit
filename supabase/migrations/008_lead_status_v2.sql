-- Migration 008: lead_status v2 — enum inglés 12 estados, tags en inglés, sin transiciones automáticas

-- 1. Eliminar el CHECK constraint de lead_status (nombre auto-generado — buscamos dinámicamente)
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
  FROM pg_constraint
  WHERE conrelid = 'leads'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%lead_status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE leads DROP CONSTRAINT %I', cname);
  END IF;
END;
$$;

-- 2. Renombrar claves de closing_reason (5 cambios; 9 quedan igual)
UPDATE leads SET closing_reason = 'stopped_responding'  WHERE closing_reason = 'went_silent';
UPDATE leads SET closing_reason = 'not_in_real_estate'  WHERE closing_reason = 'not_real_estate';
UPDATE leads SET closing_reason = 'already_has_system'  WHERE closing_reason = 'has_system';
UPDATE leads SET closing_reason = 'profile_unqualified' WHERE closing_reason = 'not_qualified';
UPDATE leads SET closing_reason = 'said_yes_ghosted'    WHERE closing_reason = 'ghosted_after_yes';

-- 3. Renombrar claves de answer_quality (3 cambios)
UPDATE leads SET answer_quality = 'positive' WHERE answer_quality = 'positiva';
UPDATE leads SET answer_quality = 'neutral'  WHERE answer_quality = 'neutra';
UPDATE leads SET answer_quality = 'negative' WHERE answer_quality = 'negativa';

-- 4. Mapear lead_status al enum inglés (ya sin CHECK — puede actualizar libremente)
UPDATE leads SET lead_status = 'opener_answered' WHERE lead_status IN ('respondio', 'en_conversacion');
UPDATE leads SET lead_status = 'in_demo'         WHERE lead_status = 'demo_agendada';
UPDATE leads SET lead_status = 'in_strategy'     WHERE lead_status = 'estrategia_agendada';
UPDATE leads SET lead_status = 'client'          WHERE lead_status = 'cliente';
UPDATE leads SET lead_status = 'closed'          WHERE lead_status = 'perdido';
UPDATE leads SET lead_status = 'passive_discard' WHERE lead_status = 'descartado';
UPDATE leads SET lead_status = 'without_answer'  WHERE lead_status IN ('nuevo', 'contactado');

-- 5. Agregar nuevo CHECK con los 12 estados ingleses
ALTER TABLE leads
  ADD CONSTRAINT leads_lead_status_check
  CHECK (lead_status IN (
    'without_answer', 'opener_answered', 'fu1_sent', 'fu2_sent',
    'in_follow_up', 'interested', 'in_demo', 'in_strategy', 'client',
    'closed', 'passive_discard', 'rejected'
  ));

-- 6. Cambiar el DEFAULT de la columna
ALTER TABLE leads ALTER COLUMN lead_status SET DEFAULT 'without_answer';

-- 7. Recrear la vista leads_awaiting_reply con los nuevos valores de exclusión
DROP VIEW IF EXISTS leads_awaiting_reply;
CREATE VIEW leads_awaiting_reply AS
SELECT l.*,
       (SELECT d.body FROM drafts d
         WHERE d.lead_id = l.id AND d.status = 'pending'
         ORDER BY d.generated_at DESC LIMIT 1) AS pending_draft
FROM leads l
WHERE l.last_inbound_at IS NOT NULL
  AND (l.last_outbound_at IS NULL OR l.last_inbound_at > l.last_outbound_at)
  AND l.lead_status NOT IN ('client', 'closed', 'passive_discard', 'rejected');
