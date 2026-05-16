SET search_path = '';

-- ============================================================
-- Directory sync metadata on existing modules_directory table
-- ============================================================
ALTER TABLE public.modules_directory
  ADD COLUMN IF NOT EXISTS source_provider TEXT,
  ADD COLUMN IF NOT EXISTS source_external_id TEXT,
  ADD COLUMN IF NOT EXISTS source_owner TEXT,
  ADD COLUMN IF NOT EXISTS source_repo TEXT,
  ADD COLUMN IF NOT EXISTS source_url_normalized TEXT,
  ADD COLUMN IF NOT EXISTS readme_hash TEXT,
  ADD COLUMN IF NOT EXISTS stars_count INTEGER,
  ADD COLUMN IF NOT EXISTS source_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_pushed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_ai_refresh_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS summary_source_lang TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_i18n JSONB,
  ADD COLUMN IF NOT EXISTS ai_tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS ai_level TEXT,
  ADD COLUMN IF NOT EXISTS sync_error TEXT,
  ADD COLUMN IF NOT EXISTS managed_by_sync BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.modules_directory
  DROP CONSTRAINT IF EXISTS modules_directory_source_provider_check;

ALTER TABLE public.modules_directory
  ADD CONSTRAINT modules_directory_source_provider_check
  CHECK (
    source_provider IS NULL
    OR source_provider IN ('github', 'huggingface', 'manual')
  );

ALTER TABLE public.modules_directory
  DROP CONSTRAINT IF EXISTS modules_directory_summary_source_lang_check;

ALTER TABLE public.modules_directory
  ADD CONSTRAINT modules_directory_summary_source_lang_check
  CHECK (
    summary_source_lang IS NULL
    OR summary_source_lang IN ('fr', 'en')
  );

ALTER TABLE public.modules_directory
  DROP CONSTRAINT IF EXISTS modules_directory_ai_level_check;

ALTER TABLE public.modules_directory
  ADD CONSTRAINT modules_directory_ai_level_check
  CHECK (
    ai_level IS NULL
    OR ai_level IN ('beginner', 'intermediate', 'advanced')
  );

-- Backfill stars_count when present in json_config legacy payload.
UPDATE public.modules_directory
SET stars_count = NULLIF(regexp_replace(COALESCE(json_config->>'stars', ''), '[^0-9]', '', 'g'), '')::INTEGER
WHERE stars_count IS NULL
  AND COALESCE(json_config->>'stars', '') <> '';

-- Backfill provider/external ids from known URL patterns.
WITH parsed AS (
  SELECT
    id,
    lower(trim(both '/' from github_url)) AS normalized_url,
    (regexp_match(github_url, 'github\.com/([^/]+)/([^/?#]+)'))[1] AS gh_owner,
    regexp_replace((regexp_match(github_url, 'github\.com/([^/]+)/([^/?#]+)'))[2], '\.git$', '') AS gh_repo,
    (regexp_match(github_url, '(?:huggingface\.co|hf\.co)/([^/?#]+/[^/?#]+)'))[1] AS hf_model_id
  FROM public.modules_directory
)
UPDATE public.modules_directory md
SET
  source_url_normalized = COALESCE(md.source_url_normalized, parsed.normalized_url),
  source_provider = COALESCE(
    md.source_provider,
    CASE
      WHEN parsed.gh_owner IS NOT NULL AND parsed.gh_repo IS NOT NULL THEN 'github'
      WHEN parsed.hf_model_id IS NOT NULL THEN 'huggingface'
      ELSE NULL
    END
  ),
  source_owner = COALESCE(md.source_owner, parsed.gh_owner),
  source_repo = COALESCE(md.source_repo, parsed.gh_repo),
  source_external_id = COALESCE(
    md.source_external_id,
    CASE
      WHEN parsed.gh_owner IS NOT NULL AND parsed.gh_repo IS NOT NULL THEN lower(parsed.gh_owner || '/' || parsed.gh_repo)
      WHEN parsed.hf_model_id IS NOT NULL THEN lower(parsed.hf_model_id)
      ELSE NULL
    END
  )
FROM parsed
WHERE md.id = parsed.id;

-- Seed bilingual summary payload from existing description when empty.
UPDATE public.modules_directory
SET
  ai_summary_i18n = jsonb_build_object('en', description),
  summary_source_lang = COALESCE(summary_source_lang, 'en')
WHERE ai_summary_i18n IS NULL
  AND COALESCE(description, '') <> '';

-- Keep only unique normalized URLs backfilled; conflicting historical rows remain NULL
-- to avoid migration failure while preserving current records.
WITH dupes AS (
  SELECT source_url_normalized
  FROM public.modules_directory
  WHERE source_url_normalized IS NOT NULL
  GROUP BY source_url_normalized
  HAVING COUNT(*) > 1
)
UPDATE public.modules_directory md
SET source_url_normalized = NULL
FROM dupes
WHERE md.source_url_normalized = dupes.source_url_normalized;

-- Keep only one provider/external-id pair when historical seed rows collide.
WITH ranked_provider_ids AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY source_provider, source_external_id
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS row_number
  FROM public.modules_directory
  WHERE source_provider IS NOT NULL
    AND source_external_id IS NOT NULL
)
UPDATE public.modules_directory md
SET
  source_provider = NULL,
  source_external_id = NULL
FROM ranked_provider_ids ranked
WHERE md.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_directory_source_provider_external_id
  ON public.modules_directory(source_provider, source_external_id)
  WHERE source_provider IS NOT NULL
    AND source_external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_modules_directory_source_url_normalized
  ON public.modules_directory(source_url_normalized)
  WHERE source_url_normalized IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_modules_directory_sync_provider_type
  ON public.modules_directory(source_provider, type);

CREATE INDEX IF NOT EXISTS idx_modules_directory_sync_pushed
  ON public.modules_directory(source_pushed_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_modules_directory_sync_last_synced
  ON public.modules_directory(last_synced_at ASC NULLS FIRST);

-- ============================================================
-- Directory sync run logs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.directory_sync_runs (
  id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  mode TEXT NOT NULL CHECK (mode IN ('new', 'audit')),
  trigger_type TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('cron', 'manual')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed', 'skipped')),
  scope TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  ai_refreshed_count INTEGER NOT NULL DEFAULT 0,
  scanned_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  metrics_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_directory_sync_runs_started_at
  ON public.directory_sync_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_directory_sync_runs_mode_status
  ON public.directory_sync_runs(mode, status, started_at DESC);

ALTER TABLE public.directory_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read directory sync runs" ON public.directory_sync_runs;
CREATE POLICY "Admins can read directory sync runs"
  ON public.directory_sync_runs
  FOR SELECT
  USING (exists (
    select 1
    from public.profiles pr
    where pr.id = auth.uid()
      and pr.role = 'admin'
  ));
