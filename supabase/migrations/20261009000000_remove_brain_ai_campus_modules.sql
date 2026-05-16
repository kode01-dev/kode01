SET search_path = '';

-- Guardrail: do not drop directory-backed marketplace rows until they have been
-- migrated into first-class marketplace tables.
DO $$
DECLARE
  marketplace_like_count INTEGER := 0;
BEGIN
  IF to_regclass('public.modules_directory') IS NOT NULL THEN
    SELECT count(*)
    INTO marketplace_like_count
    FROM public.modules_directory
    WHERE type = 'built_app'
      OR price IS NOT NULL
      OR COALESCE(array_length(tech_stack, 1), 0) > 0
      OR NULLIF(btrim(COALESCE(demo_url, '')), '') IS NOT NULL;

    IF marketplace_like_count > 0 THEN
      RAISE EXCEPTION
        'Refusing to drop public.modules_directory: % marketplace-like rows remain. Migrate built_app/price/tech_stack/demo_url rows before applying this migration.',
        marketplace_like_count
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END $$;

-- Remove scheduled directory jobs without touching pg_cron/pg_net themselves.
DO $$
DECLARE
  job RECORD;
BEGIN
  IF to_regclass('cron.job') IS NULL THEN
    RAISE NOTICE 'pg_cron not available; skipping directory job unschedule.';
    RETURN;
  END IF;

  FOR job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'thiki-directory-sync-new',
      'thiki-directory-sync-audit',
      'thiki-directory-sync-audit-full',
      'thiki-directory-sync-followup'
    )
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;
END $$;

-- Preserve the saved-items table; only remove saved rows tied to removed modules.
DELETE FROM public.user_saved_items
WHERE item_type IN (
  'directory',
  'brain',
  'ai_campus',
  'mcp',
  'aiskills',
  'mcp_server',
  'ai_skill',
  'agent',
  'ui',
  'mcp_registry',
  'local_ai',
  'open_source_app',
  'ai_model',
  'built_app'
);

DELETE FROM public.recommendation_events
WHERE source_type = 'brain'
  OR event_type = 'brain_view';

DROP VIEW IF EXISTS public.directory_resource_context_counts;

DROP TRIGGER IF EXISTS tsvectorupdate ON public.modules_directory;
DROP TRIGGER IF EXISTS sync_primary_domain_from_modules_directory_category_tg ON public.modules_directory;
DROP TRIGGER IF EXISTS sync_modules_directory_category_from_primary_domain_tg ON public.modules_directory_domains;
DROP TRIGGER IF EXISTS trg_touch_directory_resource_contexts_updated_at ON public.directory_resource_contexts;
DROP TRIGGER IF EXISTS trg_touch_directory_sync_followup_queue_updated_at ON public.directory_sync_followup_queue;
DROP TRIGGER IF EXISTS ai_campus_sources_updated_at ON public.ai_campus_sources;

DROP FUNCTION IF EXISTS public.modules_directory_search_vector_update();
DROP FUNCTION IF EXISTS public.sync_modules_directory_category_from_primary_domain();
DROP FUNCTION IF EXISTS public.sync_primary_domain_from_modules_directory_category();
DROP FUNCTION IF EXISTS public.increment_directory_views(UUID);
DROP FUNCTION IF EXISTS public.increment_directory_views(uuid);
DROP FUNCTION IF EXISTS public.touch_directory_resource_contexts_updated_at();
DROP FUNCTION IF EXISTS public.touch_directory_sync_followup_queue_updated_at();
DROP FUNCTION IF EXISTS private.build_directory_sync_payload(TEXT);
DROP FUNCTION IF EXISTS private.resolve_directory_sync_scope();
DROP FUNCTION IF EXISTS private.get_directory_sync_cron_timezone();
DROP FUNCTION IF EXISTS private.invoke_directory_sync_cron(JSONB);
DROP FUNCTION IF EXISTS private.get_cron_secret();

DROP TABLE IF EXISTS public.directory_resource_context_debug CASCADE;
DROP TABLE IF EXISTS public.directory_resource_contexts CASCADE;
DROP TABLE IF EXISTS public.directory_views CASCADE;
DROP TABLE IF EXISTS public.modules_directory_domains CASCADE;
DROP TABLE IF EXISTS public.ai_compatibilities CASCADE;
DROP TABLE IF EXISTS public.directory_sync_followup_queue CASCADE;
DROP TABLE IF EXISTS public.directory_sync_runs CASCADE;
DROP TABLE IF EXISTS public.directory_domains CASCADE;
DROP TABLE IF EXISTS public.modules_directory CASCADE;
DROP TABLE IF EXISTS public.ai_resource_sync_queue CASCADE;
DROP TABLE IF EXISTS public.ai_resources CASCADE;
DROP TABLE IF EXISTS public.ai_campus_sources CASCADE;

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Enable insert for service role only" ON storage.objects;
DROP POLICY IF EXISTS "Enable update for service role only" ON storage.objects;
DROP POLICY IF EXISTS "Enable delete for service role only" ON storage.objects;

DO $$
BEGIN
  RAISE NOTICE 'Storage bucket resources-covers must be emptied and deleted through the Supabase Storage API; direct DELETE from storage tables is blocked on hosted Supabase.';
END $$;
