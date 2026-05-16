SET search_path = '';

ALTER TABLE public.modules_directory
  ADD COLUMN IF NOT EXISTS source_kind TEXT;

ALTER TABLE public.modules_directory
  DROP CONSTRAINT IF EXISTS modules_directory_source_kind_check;

ALTER TABLE public.modules_directory
  ADD CONSTRAINT modules_directory_source_kind_check
  CHECK (
    source_kind IS NULL
    OR source_kind IN ('github_repo', 'hf_model', 'hf_dataset', 'manual')
  );

UPDATE public.modules_directory
SET source_kind = CASE
  WHEN source_kind IS NOT NULL THEN source_kind
  WHEN source_provider = 'github' THEN 'github_repo'
  WHEN source_provider = 'huggingface' AND github_url ~* 'huggingface\.co/datasets/' THEN 'hf_dataset'
  WHEN source_provider = 'huggingface' THEN 'hf_model'
  ELSE 'manual'
END;

CREATE TABLE IF NOT EXISTS public.directory_resource_contexts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_id UUID NOT NULL REFERENCES public.modules_directory(id) ON DELETE CASCADE,
  source_provider TEXT NOT NULL CHECK (source_provider IN ('github', 'huggingface', 'manual')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('github_repo', 'hf_model', 'hf_dataset', 'manual')),
  source_external_id TEXT,
  content_hash TEXT,
  skills_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  faq_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  commands_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  source_files_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  parser_version TEXT NOT NULL DEFAULT 'v1',
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT directory_resource_contexts_directory_unique UNIQUE (directory_id)
);

CREATE INDEX IF NOT EXISTS idx_directory_resource_contexts_provider_kind
  ON public.directory_resource_contexts(source_provider, source_kind);

CREATE INDEX IF NOT EXISTS idx_directory_resource_contexts_external_id
  ON public.directory_resource_contexts(source_external_id);

CREATE TABLE IF NOT EXISTS public.directory_resource_context_debug (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  directory_id UUID NOT NULL REFERENCES public.modules_directory(id) ON DELETE CASCADE,
  readme_raw TEXT,
  skill_raw TEXT,
  faq_raw TEXT,
  blocked_commands_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  parser_warnings_json JSONB NOT NULL DEFAULT '[]'::JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT directory_resource_context_debug_directory_unique UNIQUE (directory_id)
);

CREATE OR REPLACE FUNCTION public.touch_directory_resource_contexts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_directory_resource_contexts_updated_at
  ON public.directory_resource_contexts;

CREATE TRIGGER trg_touch_directory_resource_contexts_updated_at
  BEFORE UPDATE ON public.directory_resource_contexts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_directory_resource_contexts_updated_at();

ALTER TABLE public.directory_resource_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.directory_resource_context_debug ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read directory resource contexts" ON public.directory_resource_contexts;
CREATE POLICY "Public can read directory resource contexts"
  ON public.directory_resource_contexts
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role can manage directory resource contexts" ON public.directory_resource_contexts;
CREATE POLICY "Service role can manage directory resource contexts"
  ON public.directory_resource_contexts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read directory context debug" ON public.directory_resource_context_debug;
CREATE POLICY "Admins can read directory context debug"
  ON public.directory_resource_context_debug
  FOR SELECT
  USING (
    exists (
      select 1
      from public.profiles pr
      where pr.id = auth.uid()
        and pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Service role can manage directory context debug" ON public.directory_resource_context_debug;
CREATE POLICY "Service role can manage directory context debug"
  ON public.directory_resource_context_debug
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
