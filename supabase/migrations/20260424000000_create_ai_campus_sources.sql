SET search_path = '';

CREATE TABLE IF NOT EXISTS public.ai_campus_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100 CHECK (priority >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_campus_sources_active_priority
  ON public.ai_campus_sources (is_active, priority DESC, created_at ASC);

DROP TRIGGER IF EXISTS ai_campus_sources_updated_at ON public.ai_campus_sources;
CREATE TRIGGER ai_campus_sources_updated_at
  BEFORE UPDATE ON public.ai_campus_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_campus_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can read AI campus sources" ON public.ai_campus_sources;
CREATE POLICY "Service role can read AI campus sources"
  ON public.ai_campus_sources
  FOR SELECT
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Service role can insert AI campus sources" ON public.ai_campus_sources;
CREATE POLICY "Service role can insert AI campus sources"
  ON public.ai_campus_sources
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can update AI campus sources" ON public.ai_campus_sources;
CREATE POLICY "Service role can update AI campus sources"
  ON public.ai_campus_sources
  FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role can delete AI campus sources" ON public.ai_campus_sources;
CREATE POLICY "Service role can delete AI campus sources"
  ON public.ai_campus_sources
  FOR DELETE
  TO service_role
  USING (true);

INSERT INTO public.ai_campus_sources (url, provider, priority, is_active)
VALUES
  ('https://claude.com/resources/use-cases', 'anthropic.com', 100, true),
  ('https://cookbook.openai.com/', 'openai.com', 100, true),
  ('https://scrimba.com/learn/aiengineer', 'scrimba.com', 100, true),
  ('https://www.deeplearning.ai/courses/', 'deeplearning.ai', 100, true),
  ('https://aiskillsnavigator.microsoft.com/', 'microsoft.com', 100, true),
  ('https://www.youtube.com/playlist?list=PLFPUGjQjckXEtP-13QALKWUVpUcuYpvuE', 'microsoft.com', 100, true),
  ('https://grow.google/intl/en_ca/enroll-certificates/ai-essentials-mid/', 'google.com', 100, true),
  ('https://pll.harvard.edu/course/cs50s-introduction-artificial-intelligence-python', 'harvard.edu', 100, true),
  ('https://huggingface.co/learn', 'huggingface.co', 100, true)
ON CONFLICT (url) DO NOTHING;
