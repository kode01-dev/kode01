-- Persist paid AI generation outputs so failed recap runs can resume without
-- repeating already-successful Anthropic calls.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.ai_recap_generation_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_key TEXT NOT NULL,
  run_id UUID REFERENCES public.ai_recap_runs(id) ON DELETE SET NULL,
  stage TEXT NOT NULL CHECK (btrim(stage) <> ''),
  input_hash TEXT NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  provider TEXT NOT NULL CHECK (provider IN ('anthropic', 'gemini')),
  model TEXT NOT NULL CHECK (btrim(model) <> ''),
  status TEXT NOT NULL CHECK (status IN ('succeeded', 'failed')),
  output_json JSONB,
  error_message TEXT,
  usage_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_key, stage, input_hash)
);

CREATE INDEX IF NOT EXISTS idx_ai_recap_generation_artifacts_run
  ON public.ai_recap_generation_artifacts(run_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_recap_generation_artifacts_status
  ON public.ai_recap_generation_artifacts(status, provider, created_at DESC);

CREATE TRIGGER ai_recap_generation_artifacts_updated_at
  BEFORE UPDATE ON public.ai_recap_generation_artifacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_recap_generation_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read ai recap generation artifacts"
  ON public.ai_recap_generation_artifacts
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );
