-- Migration: Add API rate limit table + helper function
-- Goal: anti-abuse without external infra

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  rate_key TEXT PRIMARY KEY,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_updated_at
  ON public.api_rate_limits(updated_at DESC);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window_start TIMESTAMPTZ := v_now - make_interval(secs => p_window_seconds);
  v_count INTEGER;
BEGIN
  INSERT INTO public.api_rate_limits (rate_key, window_started_at, request_count, updated_at)
  VALUES (p_key, v_now, 1, v_now)
  ON CONFLICT (rate_key) DO UPDATE
  SET
    request_count = CASE
      WHEN public.api_rate_limits.window_started_at < v_window_start THEN 1
      ELSE public.api_rate_limits.request_count + 1
    END,
    window_started_at = CASE
      WHEN public.api_rate_limits.window_started_at < v_window_start THEN v_now
      ELSE public.api_rate_limits.window_started_at
    END,
    updated_at = v_now
  RETURNING request_count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

