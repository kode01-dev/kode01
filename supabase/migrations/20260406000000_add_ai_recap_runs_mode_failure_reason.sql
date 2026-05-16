-- Migration: add run mode/failure reason to ai recap runs for phase observability

ALTER TABLE public.ai_recap_runs
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'run';

ALTER TABLE public.ai_recap_runs
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_recap_runs_mode_check'
  ) THEN
    ALTER TABLE public.ai_recap_runs
      ADD CONSTRAINT ai_recap_runs_mode_check
      CHECK (mode IN ('run', 'tick', 'build_article', 'send_newsletter', 'retry_newsletter'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_ai_recap_runs_mode_status_started_at
  ON public.ai_recap_runs(mode, status, started_at DESC);
