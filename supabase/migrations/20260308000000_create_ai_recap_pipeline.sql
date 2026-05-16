-- Migration: Create AI weekly recap pipeline tables
-- Includes source registry, run tracking, published posts and newsletter dispatch logs.
-- SOC 2 style: RLS enabled, search_path hardened.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.ai_recap_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  feed_url TEXT,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  locale_hint TEXT NOT NULL DEFAULT 'both' CHECK (locale_hint IN ('fr', 'en', 'both')),
  scrape_route TEXT NOT NULL DEFAULT 'firecrawl',
  rss_allow_firecrawl_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_recap_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_key TEXT NOT NULL,
  trigger_type TEXT NOT NULL DEFAULT 'cron' CHECK (trigger_type IN ('cron', 'manual', 'retry')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_key, attempt)
);

CREATE TABLE IF NOT EXISTS public.ai_recap_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'failed')),
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  run_id UUID REFERENCES public.ai_recap_runs(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_recap_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.ai_recap_runs(id) ON DELETE CASCADE,
  source_id UUID REFERENCES public.ai_recap_sources(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  raw_markdown TEXT,
  cleaned_text TEXT,
  http_status INTEGER,
  scrape_ok BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_recap_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES public.ai_recap_editions(id) ON DELETE CASCADE,
  locale TEXT NOT NULL CHECK (locale IN ('fr', 'en')),
  slug TEXT NOT NULL UNIQUE CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title TEXT NOT NULL,
  intro TEXT NOT NULL,
  content_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_markdown TEXT NOT NULL,
  excerpt TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_id, locale)
);

CREATE TABLE IF NOT EXISTS public.ai_recap_newsletter_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id UUID NOT NULL REFERENCES public.ai_recap_editions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'sendfox' CHECK (provider IN ('sendfox')),
  sendfox_campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_ai_recap_sources_active_priority
  ON public.ai_recap_sources(is_active, priority DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recap_runs_edition_status
  ON public.ai_recap_runs(edition_key, status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recap_documents_run
  ON public.ai_recap_documents(run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recap_posts_published
  ON public.ai_recap_posts(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_recap_posts_edition
  ON public.ai_recap_posts(edition_id, locale);
CREATE INDEX IF NOT EXISTS idx_ai_recap_posts_tags
  ON public.ai_recap_posts USING gin (tags);
CREATE INDEX IF NOT EXISTS idx_ai_recap_dispatches_edition
  ON public.ai_recap_newsletter_dispatches(edition_id, status);

CREATE TRIGGER ai_recap_sources_updated_at
  BEFORE UPDATE ON public.ai_recap_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ai_recap_editions_updated_at
  BEFORE UPDATE ON public.ai_recap_editions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ai_recap_posts_updated_at
  BEFORE UPDATE ON public.ai_recap_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_recap_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recap_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recap_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recap_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recap_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_recap_newsletter_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read published ai recap posts"
  ON public.ai_recap_posts
  FOR SELECT
  USING (is_published = TRUE);

CREATE POLICY "Admins can read ai recap sources"
  ON public.ai_recap_sources
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

CREATE POLICY "Admins can insert ai recap sources"
  ON public.ai_recap_sources
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

CREATE POLICY "Admins can update ai recap sources"
  ON public.ai_recap_sources
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

CREATE POLICY "Admins can delete ai recap sources"
  ON public.ai_recap_sources
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

CREATE POLICY "Admins can read ai recap runs"
  ON public.ai_recap_runs
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

CREATE POLICY "Admins can read ai recap editions"
  ON public.ai_recap_editions
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

CREATE POLICY "Admins can read ai recap documents"
  ON public.ai_recap_documents
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

CREATE POLICY "Admins can read ai recap dispatches"
  ON public.ai_recap_newsletter_dispatches
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

CREATE POLICY "Admins can read all ai recap posts"
  ON public.ai_recap_posts
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

INSERT INTO public.ai_recap_sources (name, url, domain, priority, is_active, locale_hint)
VALUES
  ('OpenAI News', 'https://openai.com/news/', 'openai.com', 200, TRUE, 'both'),
  ('Anthropic News', 'https://www.anthropic.com/news', 'anthropic.com', 190, TRUE, 'both'),
  ('Google DeepMind Blog', 'https://deepmind.google/discover/blog/', 'deepmind.google', 180, TRUE, 'both'),
  ('NVIDIA AI Blog', 'https://blogs.nvidia.com/blog/category/ai/', 'blogs.nvidia.com', 160, TRUE, 'both'),
  ('Hugging Face Blog', 'https://huggingface.co/blog', 'huggingface.co', 150, TRUE, 'both')
ON CONFLICT (url) DO NOTHING;
