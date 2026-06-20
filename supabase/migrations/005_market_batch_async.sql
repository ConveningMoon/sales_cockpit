-- =============================================================================
-- Migración 005 — market data vía Anthropic Batch API (async)
-- El job de market data se procesa fuera del request de Vercel (sin timeout).
-- =============================================================================

ALTER TABLE batches
  -- id del job de Anthropic (null = sin job activo)
  ADD COLUMN market_batch_id   text,
  -- lista ordenada [{country, city}] para mapear custom_id "geo_<i>" → geografía
  ADD COLUMN market_batch_geos jsonb;
