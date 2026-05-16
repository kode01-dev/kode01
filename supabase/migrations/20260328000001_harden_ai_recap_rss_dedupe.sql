-- Migration: Harden AI recap RSS dedupe/query performance
-- 20260328000001_harden_ai_recap_rss_dedupe.sql

SET search_path = '';

-- Normalize blank feed URLs so RSS-enabled source filtering behaves consistently.
UPDATE public.ai_recap_sources
SET feed_url = NULL
WHERE feed_url IS NOT NULL
  AND btrim(feed_url) = '';

-- Speed up duplicate lookup for feed-resolved article URLs.
CREATE INDEX IF NOT EXISTS idx_ai_recap_documents_source_url_success
  ON public.ai_recap_documents(source_url)
  WHERE scrape_ok = TRUE;
