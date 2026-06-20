-- =============================================================================
-- Migración 007 — campos manuales de tracking por lead (cero tokens)
-- Validación contra listas cerradas en el API (mismo patrón que lead_status),
-- no en la DB. Se guardan claves estables; las etiquetas viven en ui-helpers.
-- =============================================================================

ALTER TABLE leads ADD COLUMN closing_reason text;
ALTER TABLE leads ADD COLUMN answer_quality text;
