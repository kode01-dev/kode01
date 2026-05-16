SET search_path = '';

ALTER TABLE public.directory_resource_contexts
  ADD COLUMN IF NOT EXISTS about_raw TEXT,
  ADD COLUMN IF NOT EXISTS readme_raw TEXT,
  ADD COLUMN IF NOT EXISTS skill_raw TEXT,
  ADD COLUMN IF NOT EXISTS faq_raw TEXT;

UPDATE public.directory_resource_contexts AS ctx
SET
  about_raw = COALESCE(ctx.about_raw, NULLIF(md.description, '')),
  readme_raw = COALESCE(ctx.readme_raw, dbg.readme_raw),
  skill_raw = COALESCE(ctx.skill_raw, dbg.skill_raw),
  faq_raw = COALESCE(ctx.faq_raw, dbg.faq_raw)
FROM public.modules_directory AS md
LEFT JOIN public.directory_resource_context_debug AS dbg
  ON dbg.directory_id = md.id
WHERE md.id = ctx.directory_id;

CREATE TABLE IF NOT EXISTS public.directory_sync_followup_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL DEFAULT 'audit' CHECK (mode IN ('audit')),
  force BOOLEAN NOT NULL DEFAULT false,
  scope TEXT[] NOT NULL DEFAULT ARRAY['mcp', 'aiskills', 'infrastructure', 'models']::TEXT[],
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  requested_by TEXT NOT NULL DEFAULT 'manual',
  source_run_id UUID REFERENCES public.directory_sync_runs(id) ON DELETE SET NULL,
  linked_run_id UUID REFERENCES public.directory_sync_runs(id) ON DELETE SET NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_directory_sync_followup_queue_status_scheduled
  ON public.directory_sync_followup_queue(status, scheduled_for ASC);

CREATE INDEX IF NOT EXISTS idx_directory_sync_followup_queue_source_run
  ON public.directory_sync_followup_queue(source_run_id);

CREATE OR REPLACE FUNCTION public.touch_directory_sync_followup_queue_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_directory_sync_followup_queue_updated_at
  ON public.directory_sync_followup_queue;

CREATE TRIGGER trg_touch_directory_sync_followup_queue_updated_at
  BEFORE UPDATE ON public.directory_sync_followup_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_directory_sync_followup_queue_updated_at();

ALTER TABLE public.directory_sync_followup_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read directory sync followup queue" ON public.directory_sync_followup_queue;
CREATE POLICY "Admins can read directory sync followup queue"
  ON public.directory_sync_followup_queue
  FOR SELECT
  USING (
    exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid()
        and pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role can manage directory sync followup queue" ON public.directory_sync_followup_queue;
CREATE POLICY "Service role can manage directory sync followup queue"
  ON public.directory_sync_followup_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron is not available. Skipping directory followup schedule.';
    RETURN;
  END IF;

  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'thiki-directory-sync-followup'
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'thiki-directory-sync-followup',
    '*/15 * * * *',
    $job$SELECT private.invoke_directory_sync_cron('{"mode":"audit","trigger":"cron","process_followups":true}'::JSONB);$job$
  );
END
$$;
