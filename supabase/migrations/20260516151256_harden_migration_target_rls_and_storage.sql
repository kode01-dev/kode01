-- Migration target hardening after applying the historical migration chain.
--
-- The original public read policy for this aggregate was created before the
-- table existed in older migration order, so fresh targets could end up with a
-- public table without RLS. Keep the intended read path for recommendations,
-- while blocking public writes at both privilege and RLS layers.
DO $$
BEGIN
  IF to_regclass('public.product_popularity_agg_90d') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.product_popularity_agg_90d ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE INSERT, UPDATE, DELETE ON public.product_popularity_agg_90d FROM anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.product_popularity_agg_90d TO anon, authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "Public can read product popularity aggregate" ON public.product_popularity_agg_90d';
    EXECUTE 'CREATE POLICY "Public can read product popularity aggregate" ON public.product_popularity_agg_90d FOR SELECT TO anon, authenticated USING (true)';
  END IF;
END
$$;

-- AI Brain / AI Campus storage must not exist on the rebuilt target. This
-- bucket can be created by older migration history; remove it here while
-- keeping the migration resilient on hosted projects that restrict direct
-- storage catalog deletion.
DO $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'resources-covers';

  DELETE FROM storage.buckets
  WHERE id = 'resources-covers';
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'resources-covers bucket cleanup skipped: %', SQLERRM;
END
$$;
