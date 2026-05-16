SET search_path = '';

ALTER TABLE public.ai_resources
  ADD COLUMN IF NOT EXISTS ai_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

CREATE INDEX IF NOT EXISTS idx_ai_resources_ai_tags_gin
  ON public.ai_resources
  USING GIN (ai_tags);
