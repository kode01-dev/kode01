SET search_path = '';

-- Schedule directory sync directly in Supabase to avoid Vercel cron load.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.get_cron_secret()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  secret_value TEXT;
BEGIN
  BEGIN
    SELECT decrypted_secret
    INTO secret_value
    FROM vault.decrypted_secrets
    WHERE name IN ('CRON_SECRET', 'cron_secret')
    ORDER BY CASE WHEN name = 'CRON_SECRET' THEN 0 ELSE 1 END
    LIMIT 1;
  EXCEPTION
    WHEN undefined_table THEN
      secret_value := NULL;
  END;

  RETURN NULLIF(trim(secret_value), '');
END;
$$;

CREATE OR REPLACE FUNCTION private.invoke_directory_sync_cron(payload JSONB DEFAULT '{}'::JSONB)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cron_secret TEXT;
  request_id BIGINT;
  edge_url TEXT := 'https://zboonzqhrbuueqqzzrgn.supabase.co/functions/v1/directory-sync-cron';
BEGIN
  cron_secret := private.get_cron_secret();

  IF cron_secret IS NULL THEN
    RAISE NOTICE 'Skipping directory sync cron call: set vault secret CRON_SECRET (or cron_secret).';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret
    ),
    body := COALESCE(payload, '{}'::JSONB)
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

DO $$
DECLARE
  existing_job RECORD;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'thiki-directory-sync-new',
      'thiki-directory-sync-audit',
      'thiki-directory-sync-audit-full'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'thiki-directory-sync-new',
  '0 4 * * *',
  $$SELECT private.invoke_directory_sync_cron('{"mode":"new","trigger":"cron"}'::JSONB);$$
);

SELECT cron.schedule(
  'thiki-directory-sync-audit',
  '0 5 * * *',
  $$SELECT private.invoke_directory_sync_cron('{"mode":"audit","trigger":"cron"}'::JSONB);$$
);

SELECT cron.schedule(
  'thiki-directory-sync-audit-full',
  '0 6 * * 0',
  $$SELECT private.invoke_directory_sync_cron('{"mode":"audit","trigger":"cron","force":true}'::JSONB);$$
);
