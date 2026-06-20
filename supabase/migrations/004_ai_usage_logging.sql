-- =============================================================================
-- Migración 004 — ai_usage como log completo de operaciones de IA
-- Registra intentos exitosos Y fallidos, con duración y contexto.
-- =============================================================================

ALTER TABLE ai_usage
  ADD COLUMN status       text NOT NULL DEFAULT 'ok'
                          CHECK (status IN ('ok', 'error')),
  ADD COLUMN error_detail text,
  ADD COLUMN duration_ms  integer,
  ADD COLUMN context      jsonb;
