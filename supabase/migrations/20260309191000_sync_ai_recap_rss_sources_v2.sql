-- Migration: Force sync AI recap RSS sources with correct scrape routing
-- 20260309191000_sync_ai_recap_rss_sources_v2.sql

SET search_path = '';

ALTER TABLE public.ai_recap_sources
  ADD COLUMN IF NOT EXISTS feed_url TEXT,
  ADD COLUMN IF NOT EXISTS scrape_route TEXT NOT NULL DEFAULT 'firecrawl',
  ADD COLUMN IF NOT EXISTS rss_allow_firecrawl_fallback BOOLEAN NOT NULL DEFAULT FALSE;

-- Upsert the curated RSS-capable source list
INSERT INTO public.ai_recap_sources (name, url, domain, feed_url, priority, is_active, locale_hint, scrape_route, rss_allow_firecrawl_fallback)
VALUES
  ('TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/', 'techcrunch.com', 'https://techcrunch.com/category/artificial-intelligence/feed/', 100, TRUE, 'both', 'rss', TRUE),
  ('The Verge AI', 'https://www.theverge.com/ai-artificial-intelligence', 'theverge.com', 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml', 100, TRUE, 'both', 'rss', TRUE),
  ('VentureBeat AI', 'https://venturebeat.com/category/ai/', 'venturebeat.com', 'https://venturebeat.com/category/ai/feed/', 100, TRUE, 'both', 'rss', TRUE),
  ('OpenAI', 'https://openai.com/news/', 'openai.com', 'https://openai.com/news/rss.xml', 100, TRUE, 'both', 'rss', TRUE),
  ('Anthropic', 'https://www.anthropic.com/news', 'anthropic.com', 'https://www.anthropic.com/news/feed', 100, TRUE, 'both', 'rss', TRUE),
  ('Microsoft AI', 'https://blogs.microsoft.com/ai/', 'blogs.microsoft.com', 'https://blogs.microsoft.com/ai/feed/', 100, TRUE, 'both', 'rss', TRUE),
  ('Google DeepMind', 'https://deepmind.google/blog/', 'deepmind.google', 'https://deepmind.google/blog/rss.xml', 100, TRUE, 'both', 'rss', TRUE),
  ('Mistral AI', 'https://mistral.ai/news/', 'mistral.ai', 'https://mistral.ai/news/feed/', 100, TRUE, 'both', 'rss', TRUE),
  ('Meta AI', 'https://ai.meta.com/blog/', 'ai.meta.com', 'https://ai.meta.com/blog/rss/', 100, TRUE, 'both', 'rss', TRUE),
  ('The Rundown AI', 'https://www.therundown.ai/', 'therundown.ai', 'https://www.therundown.ai/feed', 90, TRUE, 'both', 'rss', TRUE),
  ('Artificial Intelligence News', 'https://www.artificialintelligence-news.com/', 'artificialintelligence-news.com', 'https://www.artificialintelligence-news.com/feed/', 90, TRUE, 'both', 'rss', TRUE),
  ('MarkTechPost', 'https://www.marktechpost.com/', 'marktechpost.com', 'https://www.marktechpost.com/feed/', 90, TRUE, 'both', 'rss', TRUE),
  ('NVIDIA AI', 'https://blogs.nvidia.com/blog/category/ai/', 'blogs.nvidia.com', 'https://blogs.nvidia.com/blog/category/ai/feed/', 100, TRUE, 'both', 'rss', TRUE),
  ('Ars Technica AI', 'https://arstechnica.com/tag/ai/', 'arstechnica.com', 'https://arstechnica.com/tag/ai/feed/', 80, TRUE, 'both', 'rss', TRUE),
  ('Gary Marcus (Substack)', 'https://garymarcus.substack.com/', 'garymarcus.substack.com', 'https://garymarcus.substack.com/feed', 80, TRUE, 'both', 'rss', TRUE)
ON CONFLICT (url) DO UPDATE SET
  name = EXCLUDED.name,
  domain = EXCLUDED.domain,
  feed_url = EXCLUDED.feed_url,
  priority = EXCLUDED.priority,
  is_active = EXCLUDED.is_active,
  locale_hint = EXCLUDED.locale_hint,
  scrape_route = EXCLUDED.scrape_route,
  rss_allow_firecrawl_fallback = EXCLUDED.rss_allow_firecrawl_fallback;
