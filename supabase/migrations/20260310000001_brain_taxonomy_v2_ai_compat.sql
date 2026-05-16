SET search_path = '';

-- ============================================================
-- BRAIN TAXONOMY v2 - AI compatibility enrichment
-- ============================================================
-- Adds compatibility status metadata and broadens supported AI names.
-- ============================================================

ALTER TABLE public.ai_compatibilities
    ADD COLUMN IF NOT EXISTS compat_status TEXT,
    ADD COLUMN IF NOT EXISTS evidence_url TEXT,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

ALTER TABLE public.ai_compatibilities
    ALTER COLUMN compat_status SET DEFAULT 'claimed';

UPDATE public.ai_compatibilities
SET compat_status = 'claimed'
WHERE compat_status IS NULL;

UPDATE public.ai_compatibilities
SET
    compat_status = 'claimed',
    evidence_url = NULL,
    verified_at = NULL
WHERE compat_status = 'verified'
  AND (evidence_url IS NULL OR btrim(evidence_url) = '' OR verified_at IS NULL);

ALTER TABLE public.ai_compatibilities
    ALTER COLUMN compat_status SET NOT NULL;

ALTER TABLE public.ai_compatibilities
    DROP CONSTRAINT IF EXISTS ai_compatibilities_ai_name_check;

ALTER TABLE public.ai_compatibilities
    DROP CONSTRAINT IF EXISTS ai_compatibilities_compat_status_check;

ALTER TABLE public.ai_compatibilities
    DROP CONSTRAINT IF EXISTS ai_compatibilities_verified_requires_evidence_check;

ALTER TABLE public.ai_compatibilities
    ADD CONSTRAINT ai_compatibilities_ai_name_check
    CHECK (ai_name IN (
        'Claude',
        'Gemini',
        'ChatGPT',
        'Copilot',
        'Perplexity',
        'Grok',
        'Mistral Le Chat',
        'Meta AI',
        'Amazon Q',
        'Llama',
        'Qwen',
        'DeepSeek',
        'Gemma',
        'Mistral (Open Models)',
        'Ollama',
        'vLLM',
        'LM Studio'
    ));

ALTER TABLE public.ai_compatibilities
    ADD CONSTRAINT ai_compatibilities_compat_status_check
    CHECK (compat_status IN ('verified', 'claimed', 'partial'));

ALTER TABLE public.ai_compatibilities
    ADD CONSTRAINT ai_compatibilities_verified_requires_evidence_check
    CHECK (
        compat_status <> 'verified'
        OR (
            evidence_url IS NOT NULL
            AND btrim(evidence_url) <> ''
            AND verified_at IS NOT NULL
        )
    );

CREATE INDEX IF NOT EXISTS idx_ai_compatibilities_ai_name_status
    ON public.ai_compatibilities(ai_name, compat_status);

CREATE INDEX IF NOT EXISTS idx_ai_compatibilities_compat_status
    ON public.ai_compatibilities(compat_status);
