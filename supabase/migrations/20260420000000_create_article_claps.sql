-- Migration: Medium-style clap system for editorial blog and AI recap news articles.
-- Tracks per-visitor clap counts (authenticated or anonymous via cookie).
-- Max 50 claps per visitor per article.
-- All writes go through the SECURITY DEFINER RPC; direct table writes are blocked.

SET search_path = '';

-- Core claps table: one row per (clapper, content_type, content_id)
CREATE TABLE IF NOT EXISTS public.article_claps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clapper_id UUID NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('editorial_post', 'recap_post')),
  content_id UUID NOT NULL,
  clap_count INTEGER NOT NULL DEFAULT 1 CHECK (clap_count BETWEEN 1 AND 50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(clapper_id, content_type, content_id)
);

COMMENT ON TABLE public.article_claps IS 'Medium-style claps: each row is one visitor''s claps on one article';
COMMENT ON COLUMN public.article_claps.clapper_id IS 'auth.uid() for logged-in users, or a server-generated cookie UUID for anonymous visitors';

-- Indexes
CREATE INDEX idx_article_claps_content
  ON public.article_claps(content_type, content_id);

-- Auto-update updated_at
CREATE TRIGGER article_claps_updated_at
  BEFORE UPDATE ON public.article_claps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.article_claps ENABLE ROW LEVEL SECURITY;

-- RLS: anyone can READ clap data (public counters)
CREATE POLICY "Public can read article claps"
  ON public.article_claps
  FOR SELECT
  USING (true);

-- RLS: NO direct INSERT/UPDATE/DELETE from client roles.
-- All writes MUST go through the SECURITY DEFINER RPC below.
-- This prevents direct manipulation of clap counts via the Supabase client.

-- Grant read-only to client roles; the RPC handles writes as SECURITY DEFINER
GRANT SELECT ON public.article_claps TO anon, authenticated;

-- Aggregate view for efficient total-count lookups
CREATE VIEW public.article_clap_stats
WITH (security_invoker = true)
AS
SELECT
  content_type,
  content_id,
  COALESCE(SUM(clap_count), 0)::INTEGER AS total_claps,
  COUNT(DISTINCT clapper_id)::INTEGER AS unique_clappers
FROM public.article_claps
GROUP BY content_type, content_id;

GRANT SELECT ON public.article_clap_stats TO anon, authenticated;

-- Atomic upsert RPC: inserts or increments claps, capped at 50.
-- SECURITY DEFINER so it bypasses RLS (the only write path).
-- Validates:
--   1. content_type is valid (CHECK constraint)
--   2. clap_count stays within 1-50 (CHECK constraint + LEAST/GREATEST)
--   3. content_id references an actual published article
--   4. p_add_count is positive and bounded
CREATE OR REPLACE FUNCTION public.upsert_article_clap(
  p_clapper_id UUID,
  p_content_type TEXT,
  p_content_id UUID,
  p_add_count INTEGER
)
RETURNS TABLE(user_claps INTEGER, total_claps INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_claps INTEGER;
  v_total INTEGER;
  v_exists BOOLEAN;
BEGIN
  -- Validate p_add_count
  IF p_add_count < 1 OR p_add_count > 50 THEN
    RAISE EXCEPTION 'p_add_count must be between 1 and 50';
  END IF;

  -- Validate content_type
  IF p_content_type NOT IN ('editorial_post', 'recap_post') THEN
    RAISE EXCEPTION 'Invalid content_type: %', p_content_type;
  END IF;

  -- Validate that the referenced article actually exists and is published
  IF p_content_type = 'editorial_post' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.editorial_posts
      WHERE id = p_content_id AND status = 'published'
    ) INTO v_exists;
  ELSIF p_content_type = 'recap_post' THEN
    SELECT EXISTS(
      SELECT 1 FROM public.ai_recap_posts
      WHERE id = p_content_id AND is_published = true
    ) INTO v_exists;
  END IF;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Article not found or not published';
  END IF;

  -- Atomic upsert with cap at 50
  INSERT INTO public.article_claps (clapper_id, content_type, content_id, clap_count)
  VALUES (p_clapper_id, p_content_type, p_content_id, LEAST(50, GREATEST(1, p_add_count)))
  ON CONFLICT (clapper_id, content_type, content_id)
  DO UPDATE SET
    clap_count = LEAST(50, public.article_claps.clap_count + GREATEST(1, p_add_count)),
    updated_at = now()
  RETURNING clap_count INTO v_user_claps;

  SELECT COALESCE(SUM(clap_count), 0)::INTEGER
  INTO v_total
  FROM public.article_claps
  WHERE content_type = p_content_type AND content_id = p_content_id;

  RETURN QUERY SELECT v_user_claps, v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_article_clap(UUID, TEXT, UUID, INTEGER) TO anon, authenticated;
