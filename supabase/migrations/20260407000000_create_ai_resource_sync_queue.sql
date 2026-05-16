SET search_path = '';

CREATE TABLE IF NOT EXISTS public.ai_resource_sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  source_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'imported', 'rejected', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  og_title TEXT,
  og_description TEXT,
  og_image_url TEXT,
  assigned_weekday INTEGER NOT NULL CHECK (assigned_weekday BETWEEN 0 AND 6)
);

CREATE INDEX IF NOT EXISTS idx_ai_resource_sync_queue_status_next_discovered
  ON public.ai_resource_sync_queue(status, next_attempt_at, discovered_at);

CREATE INDEX IF NOT EXISTS idx_ai_resource_sync_queue_processed_at
  ON public.ai_resource_sync_queue(processed_at DESC NULLS LAST);

ALTER TABLE public.ai_resource_sync_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can read AI resource sync queue" ON public.ai_resource_sync_queue;
CREATE POLICY "Service role can read AI resource sync queue"
  ON public.ai_resource_sync_queue
  FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role can insert AI resource sync queue" ON public.ai_resource_sync_queue;
CREATE POLICY "Service role can insert AI resource sync queue"
  ON public.ai_resource_sync_queue
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update AI resource sync queue" ON public.ai_resource_sync_queue;
CREATE POLICY "Service role can update AI resource sync queue"
  ON public.ai_resource_sync_queue
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can delete AI resource sync queue" ON public.ai_resource_sync_queue;
CREATE POLICY "Service role can delete AI resource sync queue"
  ON public.ai_resource_sync_queue
  FOR DELETE
  TO service_role
  USING (true);
