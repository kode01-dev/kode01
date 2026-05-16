-- Add AI Gatekeeper fields to ai_resources table
-- These columns support filtering, classification, and AI-rewritten descriptions

ALTER TABLE public.ai_resources
  ADD COLUMN IF NOT EXISTS technical_type TEXT,
  ADD COLUMN IF NOT EXISTS ai_domain TEXT,
  ADD COLUMN IF NOT EXISTS ai_description TEXT,
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true;

-- Constraint on technical_type (educational resource types)
ALTER TABLE public.ai_resources
  ADD CONSTRAINT ai_resources_technical_type_check
  CHECK (
    technical_type IS NULL
    OR technical_type IN ('course', 'tutorial', 'certification', 'documentation', 'cookbook', 'workshop', 'video-series')
  );

-- Constraint on ai_domain (AI learning domains)
ALTER TABLE public.ai_resources
  ADD CONSTRAINT ai_resources_ai_domain_check
  CHECK (
    ai_domain IS NULL
    OR ai_domain IN ('fundamentals', 'prompt-engineering', 'agents', 'rag', 'applied-ai')
  );

-- Allow service_role to update rows (needed for backfill and gatekeeper enrichment)
CREATE POLICY "Enable update for service role only" ON public.ai_resources
  FOR UPDATE TO service_role
  USING (true) WITH CHECK (true);
