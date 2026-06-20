-- =============================================================================
-- Migración 006 — outreach_batch_id para generación async vía Batch API
-- El custom_id de cada request es "lead_<uuid>" — no necesita tabla posicional.
-- =============================================================================

ALTER TABLE batches ADD COLUMN outreach_batch_id text;
