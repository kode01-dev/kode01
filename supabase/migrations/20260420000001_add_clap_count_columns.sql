-- Migration: Add denormalized clap_count columns to content tables.
-- Kept in sync via trigger on article_claps (same pattern as view_count/click_count).

SET search_path = '';

-- Add clap_count to editorial_posts
ALTER TABLE public.editorial_posts
  ADD COLUMN IF NOT EXISTS clap_count INTEGER NOT NULL DEFAULT 0;

-- Add clap_count to ai_recap_posts
ALTER TABLE public.ai_recap_posts
  ADD COLUMN IF NOT EXISTS clap_count INTEGER NOT NULL DEFAULT 0;

-- Indexes for sorting by popularity
CREATE INDEX IF NOT EXISTS idx_editorial_posts_clap_count
  ON public.editorial_posts(clap_count DESC);

CREATE INDEX IF NOT EXISTS idx_ai_recap_posts_clap_count
  ON public.ai_recap_posts(clap_count DESC);

-- Trigger function: recalculate and sync clap_count to content tables
CREATE OR REPLACE FUNCTION public.sync_article_clap_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_content_type TEXT;
  v_content_id UUID;
  v_total INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_content_type := OLD.content_type;
    v_content_id := OLD.content_id;
  ELSE
    v_content_type := NEW.content_type;
    v_content_id := NEW.content_id;
  END IF;

  SELECT COALESCE(SUM(clap_count), 0)
  INTO v_total
  FROM public.article_claps
  WHERE content_type = v_content_type AND content_id = v_content_id;

  IF v_content_type = 'editorial_post' THEN
    UPDATE public.editorial_posts
    SET clap_count = v_total
    WHERE id = v_content_id;
  ELSIF v_content_type = 'recap_post' THEN
    UPDATE public.ai_recap_posts
    SET clap_count = v_total
    WHERE id = v_content_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER sync_clap_count_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.article_claps
  FOR EACH ROW EXECUTE FUNCTION public.sync_article_clap_count();
