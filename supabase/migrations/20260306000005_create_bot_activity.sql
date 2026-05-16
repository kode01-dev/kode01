-- Migration: bot activity logging table
-- Stores honeypot and middleware-related bot signals

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.bot_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  reason TEXT NOT NULL,
  path TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  blocked BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_bot_activity_detected_at
  ON public.bot_activity(detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_bot_activity_source_reason
  ON public.bot_activity(source, reason);

CREATE INDEX IF NOT EXISTS idx_bot_activity_ip_address
  ON public.bot_activity(ip_address);

ALTER TABLE public.bot_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view bot activity" ON public.bot_activity;
CREATE POLICY "Admins can view bot activity"
  ON public.bot_activity
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
      AND pr.role = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION public.cleanup_bot_activity(p_keep_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  IF p_keep_days IS NULL OR p_keep_days < 1 THEN
    RAISE EXCEPTION 'p_keep_days must be >= 1';
  END IF;

  DELETE FROM public.bot_activity
  WHERE detected_at < now() - make_interval(days => p_keep_days);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_bot_activity(INTEGER)
TO service_role;
