-- Fix constraint to allow 'unknown' scrape_method and scralping
SET search_path = '';

ALTER TABLE public.ai_recap_documents DROP CONSTRAINT IF EXISTS ai_recap_documents_scrape_method_check;

ALTER TABLE public.ai_recap_documents ADD CONSTRAINT ai_recap_documents_scrape_method_check
CHECK (
  scrape_method IS NULL
  OR scrape_method IN (
    'rss',
    'cheerio',
    'firecrawl',
    'scrapling',
    'crawlee',
    'rss+cheerio',
    'rss+scrapling',
    'rss+crawlee',
    'rss+firecrawl',
    'cheerio+firecrawl',
    'scrapling+firecrawl',
    'unknown'
  )
);
