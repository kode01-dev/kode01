-- Migration intentionally left as a no-op.
-- Test seed data has been moved out of migrations to:
--   supabase/seeds/test_vendors.sql
-- This prevents accidental execution on production during migration rollout.

DO $$
BEGIN
  RAISE NOTICE 'Skipping test vendor seed migration. Use supabase/seeds/test_vendors.sql explicitly when needed.';
END;
$$;
