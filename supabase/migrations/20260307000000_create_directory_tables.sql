SET search_path = '';

CREATE TABLE public.modules_directory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  github_url TEXT NOT NULL,
  json_config JSONB,
  type TEXT NOT NULL CHECK (type IN ('ui','agent','mcp_server','ai_skill')),
  is_free BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_compatibilities (
  directory_id UUID NOT NULL REFERENCES public.modules_directory(id) ON DELETE CASCADE,
  ai_name TEXT NOT NULL CHECK (ai_name IN ('Claude','Gemini','ChatGPT')),
  PRIMARY KEY (directory_id, ai_name)
);

CREATE INDEX idx_modules_directory_type_created_at ON public.modules_directory(type, created_at DESC);
CREATE INDEX idx_modules_directory_is_free ON public.modules_directory(is_free);
CREATE INDEX idx_ai_compatibilities_ai_name ON public.ai_compatibilities(ai_name);

ALTER TABLE public.modules_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_compatibilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone."
  ON public.modules_directory FOR SELECT
  USING ( true );

CREATE POLICY "Admins can insert modules."
  ON public.modules_directory FOR INSERT
  WITH CHECK ( exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin') );

CREATE POLICY "Admins can update modules."
  ON public.modules_directory FOR UPDATE
  USING ( exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin') )
  WITH CHECK ( exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin') );

CREATE POLICY "Admins can delete modules."
  ON public.modules_directory FOR DELETE
  USING ( exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin') );


CREATE POLICY "Public compatibilities are viewable by everyone."
  ON public.ai_compatibilities FOR SELECT
  USING ( true );

CREATE POLICY "Admins can insert compatibilities."
  ON public.ai_compatibilities FOR INSERT
  WITH CHECK ( exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin') );

CREATE POLICY "Admins can update compatibilities."
  ON public.ai_compatibilities FOR UPDATE
  USING ( exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin') )
  WITH CHECK ( exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin') );

CREATE POLICY "Admins can delete compatibilities."
  ON public.ai_compatibilities FOR DELETE
  USING ( exists (select 1 from public.profiles pr where pr.id = auth.uid() and pr.role = 'admin') );
