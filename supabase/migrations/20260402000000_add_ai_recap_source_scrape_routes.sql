-- Migration: add explicit scrape routing fields for ai recap sources
-- Adds per-source scraping route selection and optional RSS->Firecrawl fallback.

SET search_path = '';

ALTER TABLE public.ai_recap_sources
  ADD COLUMN IF NOT EXISTS scrape_route TEXT,
  ADD COLUMN IF NOT EXISTS rss_allow_firecrawl_fallback BOOLEAN NOT NULL DEFAULT FALSE;

-- Keep backward-compatible behavior for existing sources.
UPDATE public.ai_recap_sources
SET scrape_route = 'firecrawl'
WHERE scrape_route IS NULL;

ALTER TABLE public.ai_recap_sources
  ALTER COLUMN scrape_route SET DEFAULT 'firecrawl',
  ALTER COLUMN scrape_route SET NOT NULL,
  ALTER COLUMN rss_allow_firecrawl_fallback SET DEFAULT FALSE,
  ALTER COLUMN rss_allow_firecrawl_fallback SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_recap_sources_scrape_route_check'
  ) THEN
    ALTER TABLE public.ai_recap_sources
      ADD CONSTRAINT ai_recap_sources_scrape_route_check
      CHECK (scrape_route IN ('rss', 'firecrawl'));
  END IF;
END $$;

