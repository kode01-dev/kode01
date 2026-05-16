SET search_path = '';

-- Reconfigure directory sync schedules with alternating provider scope by local day.
CREATE OR REPLACE FUNCTION private.get_directory_sync_cron_timezone()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tz_value TEXT;
BEGIN
  tz_value := NULL;

  BEGIN
    SELECT decrypted_secret
    INTO tz_value
    FROM vault.decrypted_secrets
    WHERE name IN ('DIRECTORY_SYNC_CRON_TZ', 'directory_sync_cron_tz')
    ORDER BY CASE WHEN name = 'DIRECTORY_SYNC_CRON_TZ' THEN 0 ELSE 1 END
    LIMIT 1;
  EXCEPTION
    WHEN undefined_table THEN
      tz_value := NULL;
  END;

  tz_value := NULLIF(trim(tz_value), '');
  IF tz_value IS NULL THEN
    RETURN 'America/Toronto';
  END IF;

  BEGIN
    PERFORM timezone(tz_value, now());
    RETURN tz_value;
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'Invalid DIRECTORY_SYNC_CRON_TZ value "%". Falling back to America/Toronto.', tz_value;
      RETURN 'America/Toronto';
  END;
END;
$$;

CREATE OR REPLACE FUNCTION private.resolve_directory_sync_scope()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  tz_value TEXT;
  local_day INTEGER;
BEGIN
  tz_value := private.get_directory_sync_cron_timezone();
  local_day := EXTRACT(DAY FROM (now() AT TIME ZONE tz_value))::INTEGER;

  -- Odd local day => GitHub scopes, even local day => Hugging Face models.
  IF MOD(local_day, 2) = 1 THEN
    RETURN '["mcp","aiskills","infrastructure"]'::JSONB;
  END IF;

  RETURN '["models"]'::JSONB;
END;
$$;

CREATE OR REPLACE FUNCTION private.build_directory_sync_payload(p_mode TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_mode NOT IN ('new', 'audit') THEN
    RAISE EXCEPTION 'Unsupported directory sync mode: %', p_mode;
  END IF;

  RETURN jsonb_build_object(
    'mode', p_mode,
    'trigger', 'cron',
    'scope', private.resolve_directory_sync_scope()
  );
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
  '15 3 * * *',
  $$SELECT private.invoke_directory_sync_cron(private.build_directory_sync_payload('new'));$$
);

SELECT cron.schedule(
  'thiki-directory-sync-audit',
  '15 4 * * *',
  $$SELECT private.invoke_directory_sync_cron(private.build_directory_sync_payload('audit'));$$
);
