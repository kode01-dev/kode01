-- Enterprise AI recap: quality payloads, summary/source manifest support, and scrape observability.
-- Keeps existing RLS model; service-role runtime writes through Supabase admin client.

SET search_path = '';

ALTER TABLE public.ai_recap_documents
  ADD COLUMN IF NOT EXISTS scrape_method TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_recap_documents_scrape_method_check'
  ) THEN
    ALTER TABLE public.ai_recap_documents
      ADD CONSTRAINT ai_recap_documents_scrape_method_check
      CHECK (
        scrape_method IS NULL
        OR scrape_method IN (
          'rss',
          'cheerio',
          'firecrawl',
          'rss+cheerio',
          'rss+firecrawl',
          'cheerio+firecrawl'
        )
      );
  END IF;
END
$$;

ALTER TABLE public.ai_recap_editions
  ADD COLUMN IF NOT EXISTS quality_report JSONB DEFAULT NULL;

-- Optional guardrail index for analytics on scrape method usage per run.
CREATE INDEX IF NOT EXISTS idx_ai_recap_documents_run_scrape_method
  ON public.ai_recap_documents (run_id, scrape_method);
