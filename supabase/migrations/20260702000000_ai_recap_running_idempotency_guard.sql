-- Prevent concurrent duplicate recap runs for the same edition/mode/trigger tuple.
-- Keeps the latest running row and marks older duplicates as failed for auditability.

SET search_path = '';

WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY edition_key, mode, trigger_type
      ORDER BY started_at DESC, created_at DESC, id DESC
    ) AS row_rank
  FROM public.ai_recap_runs
  WHERE status = 'running'
)
UPDATE public.ai_recap_runs AS runs
SET
  status = 'failed',
  finished_at = COALESCE(runs.finished_at, now()),
  failure_reason = COALESCE(runs.failure_reason, 'duplicate_running_superseded'),
  error_message = COALESCE(runs.error_message, 'Superseded by newer running recap execution')
FROM ranked_duplicates AS ranked
WHERE runs.id = ranked.id
  AND ranked.row_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_recap_runs_single_running_per_flow
  ON public.ai_recap_runs (edition_key, mode, trigger_type)
  WHERE status = 'running';
