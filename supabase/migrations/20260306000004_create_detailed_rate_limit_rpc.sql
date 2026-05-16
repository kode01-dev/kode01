-- Migration: Detailed atomic API rate limit RPC
-- Returns structured metadata for HTTP 429 responses

SET search_path = '';

CREATE OR REPLACE FUNCTION public.check_rate_limit_detailed(
  p_key TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (
  allowed BOOLEAN,
  request_count INTEGER,
  remaining INTEGER,
  reset_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_window_start TIMESTAMPTZ := v_now - make_interval(secs => p_window_seconds);
  v_row public.api_rate_limits%ROWTYPE;
  v_hash BIGINT;
BEGIN
  IF p_key IS NULL OR length(trim(p_key)) = 0 THEN
    RAISE EXCEPTION 'p_key is required';
  END IF;

  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'p_limit must be > 0';
  END IF;

  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds must be > 0';
  END IF;

  -- Avoid race conditions for the same logical key.
  v_hash := hashtextextended(p_key, 0);
  PERFORM pg_advisory_xact_lock(v_hash);

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
  RETURNING * INTO v_row;

  allowed := v_row.request_count <= p_limit;
  request_count := v_row.request_count;
  remaining := GREATEST(0, p_limit - v_row.request_count);
  reset_at := v_row.window_started_at + make_interval(secs => p_window_seconds);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_rate_limit_detailed(TEXT, INTEGER, INTEGER)
TO anon, authenticated, service_role;
