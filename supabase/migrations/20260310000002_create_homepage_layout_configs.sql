SET search_path = '';

CREATE TABLE IF NOT EXISTS public.homepage_layout_configs (
  environment TEXT PRIMARY KEY CHECK (environment IN ('draft', 'published')),
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT homepage_layout_sections_array CHECK (jsonb_typeof(sections) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_homepage_layout_configs_updated_at
  ON public.homepage_layout_configs(updated_at DESC);

ALTER TABLE public.homepage_layout_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published homepage layout" ON public.homepage_layout_configs;
CREATE POLICY "Public can read published homepage layout"
  ON public.homepage_layout_configs
  FOR SELECT
  USING (
    environment = 'published'
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert homepage layout" ON public.homepage_layout_configs;
CREATE POLICY "Admins can insert homepage layout"
  ON public.homepage_layout_configs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update homepage layout" ON public.homepage_layout_configs;
CREATE POLICY "Admins can update homepage layout"
  ON public.homepage_layout_configs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete homepage layout" ON public.homepage_layout_configs;
CREATE POLICY "Admins can delete homepage layout"
  ON public.homepage_layout_configs
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS homepage_layout_configs_updated_at ON public.homepage_layout_configs;
CREATE TRIGGER homepage_layout_configs_updated_at
  BEFORE UPDATE ON public.homepage_layout_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.homepage_layout_configs (environment, sections, published_at)
VALUES
  (
    'published',
    $json$[
      {"id":"hero-1","type":"hero","enabled":true,"order":0,"template":"classic","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"marquee-1","type":"marquee","enabled":true,"order":1,"template":"ribbon","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"features-1","type":"features","enabled":true,"order":2,"template":"split","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"products-latest-1","type":"products_latest","enabled":true,"order":3,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{"limit":8}},
      {"id":"directory-brain-1","type":"directory_brain","enabled":true,"order":4,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"directory-mcp-1","type":"directory_mcp","enabled":true,"order":5,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"directory-aiskills-1","type":"directory_aiskills","enabled":true,"order":6,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"directory-infrastructure-1","type":"directory_infrastructure","enabled":true,"order":7,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"news-latest-1","type":"news_latest","enabled":true,"order":8,"template":"cards","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{"limit":3}},
      {"id":"stats-1","type":"stats","enabled":true,"order":9,"template":"band","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}}
    ]$json$::jsonb,
    now()
  ),
  (
    'draft',
    $json$[
      {"id":"hero-1","type":"hero","enabled":true,"order":0,"template":"classic","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"marquee-1","type":"marquee","enabled":true,"order":1,"template":"ribbon","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"features-1","type":"features","enabled":true,"order":2,"template":"split","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"products-latest-1","type":"products_latest","enabled":true,"order":3,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{"limit":8}},
      {"id":"directory-brain-1","type":"directory_brain","enabled":true,"order":4,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"directory-mcp-1","type":"directory_mcp","enabled":true,"order":5,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"directory-aiskills-1","type":"directory_aiskills","enabled":true,"order":6,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"directory-infrastructure-1","type":"directory_infrastructure","enabled":true,"order":7,"template":"grid","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}},
      {"id":"news-latest-1","type":"news_latest","enabled":true,"order":8,"template":"cards","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{"limit":3}},
      {"id":"stats-1","type":"stats","enabled":true,"order":9,"template":"band","content":{"title_en":null,"title_fr":null,"subtitle_en":null,"subtitle_fr":null,"cta_label_en":null,"cta_label_fr":null,"cta_href":null},"settings":{}}
    ]$json$::jsonb,
    now()
  )
ON CONFLICT (environment) DO NOTHING;

COMMENT ON TABLE public.homepage_layout_configs IS
  'Home page layout configuration with draft/published environments.';
