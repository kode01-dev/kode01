-- Migration: Add RSS support to AI recap sources and seed 15 sources
-- 20260328000000_rss_sources_sync.sql

SET search_path = '';

-- 1. Add feed_url column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ai_recap_sources' AND TABLE_SCHEMA = 'public' AND COLUMN_NAME = 'feed_url') THEN
        ALTER TABLE public.ai_recap_sources ADD COLUMN feed_url TEXT;
    END IF;
END $$;

-- 2. Upsert the curated RSS-capable source list (this does not delete custom sources)
INSERT INTO public.ai_recap_sources (name, url, domain, feed_url, priority, is_active, locale_hint)
VALUES
  ('TechCrunch AI', 'https://techcrunch.com/category/artificial-intelligence/', 'techcrunch.com', 'https://techcrunch.com/category/artificial-intelligence/feed/', 100, TRUE, 'both'),
  ('The Verge AI', 'https://www.theverge.com/ai-artificial-intelligence', 'theverge.com', 'https://www.theverge.com/ai-artificial-intelligence/rss/index.xml', 100, TRUE, 'both'),
  ('VentureBeat AI', 'https://venturebeat.com/category/ai/', 'venturebeat.com', 'https://venturebeat.com/category/ai/feed/', 100, TRUE, 'both'),
  ('OpenAI', 'https://openai.com/news/', 'openai.com', 'https://openai.com/news/rss.xml', 100, TRUE, 'both'),
  ('Anthropic', 'https://www.anthropic.com/news', 'anthropic.com', 'https://www.anthropic.com/news/feed', 100, TRUE, 'both'),
  ('Microsoft AI', 'https://blogs.microsoft.com/ai/', 'blogs.microsoft.com', 'https://blogs.microsoft.com/ai/feed/', 100, TRUE, 'both'),
  ('Google DeepMind', 'https://deepmind.google/blog/', 'deepmind.google', 'https://deepmind.google/blog/rss.xml', 100, TRUE, 'both'),
  ('Mistral AI', 'https://mistral.ai/news/', 'mistral.ai', 'https://mistral.ai/news/feed/', 100, TRUE, 'both'),
  ('Meta AI', 'https://ai.meta.com/blog/', 'ai.meta.com', 'https://ai.meta.com/blog/rss/', 100, TRUE, 'both'),
  ('The Rundown AI', 'https://www.therundown.ai/', 'therundown.ai', 'https://www.therundown.ai/feed', 90, TRUE, 'both'),
  ('Artificial Intelligence News', 'https://www.artificialintelligence-news.com/', 'artificialintelligence-news.com', 'https://www.artificialintelligence-news.com/feed/', 90, TRUE, 'both'),
  ('MarkTechPost', 'https://www.marktechpost.com/', 'marktechpost.com', 'https://www.marktechpost.com/feed/', 90, TRUE, 'both'),
  ('NVIDIA AI', 'https://blogs.nvidia.com/blog/category/ai/', 'blogs.nvidia.com', 'https://blogs.nvidia.com/blog/category/ai/feed/', 100, TRUE, 'both'),
  ('Ars Technica AI', 'https://arstechnica.com/tag/ai/', 'arstechnica.com', 'https://arstechnica.com/tag/ai/feed/', 80, TRUE, 'both'),
  ('Gary Marcus (Substack)', 'https://garymarcus.substack.com/', 'garymarcus.substack.com', 'https://garymarcus.substack.com/feed', 80, TRUE, 'both')
ON CONFLICT (url) DO UPDATE SET
  domain = EXCLUDED.domain,
  feed_url = EXCLUDED.feed_url,
  priority = EXCLUDED.priority,
  name = EXCLUDED.name,
  is_active = EXCLUDED.is_active,
  locale_hint = EXCLUDED.locale_hint;
