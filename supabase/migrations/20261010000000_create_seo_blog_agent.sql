-- Create the SEO Blog LangGraph agent configuration and run history tables.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.seo_blog_agent_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  base_profile_id UUID REFERENCES public.seo_blog_agent_profiles(id) ON DELETE SET NULL,
  nodes_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  run_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_seo_blog_agent_profiles_one_active
  ON public.seo_blog_agent_profiles ((status))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_seo_blog_agent_profiles_status_updated
  ON public.seo_blog_agent_profiles (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.seo_blog_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id TEXT UNIQUE,
  profile_id UUID REFERENCES public.seo_blog_agent_profiles(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'generate',
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'dead_letter')),
  input JSONB NOT NULL DEFAULT '{}'::JSONB,
  node_statuses JSONB NOT NULL DEFAULT '{}'::JSONB,
  output_outline JSONB,
  article_html TEXT,
  article_markdown TEXT,
  qa_report JSONB NOT NULL DEFAULT '{}'::JSONB,
  sources_used JSONB NOT NULL DEFAULT '[]'::JSONB,
  error_message TEXT,
  editorial_post_id UUID REFERENCES public.editorial_posts(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_seo_blog_agent_runs_status_created
  ON public.seo_blog_agent_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_seo_blog_agent_runs_profile_created
  ON public.seo_blog_agent_runs (profile_id, created_at DESC);

DROP TRIGGER IF EXISTS seo_blog_agent_profiles_updated_at ON public.seo_blog_agent_profiles;
CREATE TRIGGER seo_blog_agent_profiles_updated_at
  BEFORE UPDATE ON public.seo_blog_agent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS seo_blog_agent_runs_updated_at ON public.seo_blog_agent_runs;
CREATE TRIGGER seo_blog_agent_runs_updated_at
  BEFORE UPDATE ON public.seo_blog_agent_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.seo_blog_agent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seo_blog_agent_runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_blog_agent_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seo_blog_agent_runs TO authenticated;
GRANT ALL ON public.seo_blog_agent_profiles TO service_role;
GRANT ALL ON public.seo_blog_agent_runs TO service_role;

DROP POLICY IF EXISTS "Admins can manage SEO blog agent profiles" ON public.seo_blog_agent_profiles;
CREATE POLICY "Admins can manage SEO blog agent profiles"
  ON public.seo_blog_agent_profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can manage SEO blog agent runs" ON public.seo_blog_agent_runs;
CREATE POLICY "Admins can manage SEO blog agent runs"
  ON public.seo_blog_agent_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())
        AND pr.role = 'admin'
    )
  );

INSERT INTO public.seo_blog_agent_profiles (
  name,
  description,
  status,
  version,
  nodes_config,
  run_config,
  activated_at
)
VALUES (
  'SEO Blog Writer Default',
  'Default LangGraph profile based on the optimized n8n Article Writer SEO flow.',
  'active',
  1,
  '{
    "input": {"enabled": true},
    "serp": {"enabled": true, "provider": "dataforseo", "depth": 4, "device": "mobile"},
    "competitor_scrape": {"enabled": true, "provider": "jina", "maxCompetitors": 4},
    "competitor_extract": {"enabled": true, "model": "claude-3-5-haiku-latest"},
    "aggregate": {"enabled": true},
    "nlp_map": {"enabled": true, "model": "claude-3-5-haiku-latest"},
    "intent": {"enabled": true, "model": "claude-3-5-haiku-latest"},
    "information_gain": {"enabled": true, "model": "claude-3-5-sonnet-latest", "useTavily": true},
    "writer_directive": {"enabled": true, "model": "claude-3-5-haiku-latest"},
    "title_h1": {"enabled": true, "model": "claude-3-5-haiku-latest"},
    "author_about": {"enabled": true, "provider": "scrapling"},
    "outline": {"enabled": true, "model": "claude-3-5-sonnet-latest"},
    "article_html": {"enabled": true, "model": "claude-3-5-sonnet-latest", "minWords": 1200, "maxWords": 1800},
    "html_cleanup": {"enabled": true},
    "markdown_convert": {"enabled": true},
    "quality_gate": {"enabled": true, "minWords": 900},
    "cms_draft": {"enabled": true, "category": "SEO"}
  }'::JSONB,
  '{
    "defaultLocale": "fr",
    "saveToCms": true,
    "singleLanguage": true
  }'::JSONB,
  now()
)
ON CONFLICT DO NOTHING;
