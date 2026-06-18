-- Ampliar el CHECK constraint de ai_usage.task_type para incluir 'parse_conversation'
ALTER TABLE ai_usage DROP CONSTRAINT IF EXISTS ai_usage_task_type_check;

ALTER TABLE ai_usage
  ADD CONSTRAINT ai_usage_task_type_check
  CHECK (task_type IN (
    'clasificacion','market_data','outreach','draft','other','parse_conversation'
  ));
