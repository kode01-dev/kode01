-- RLS admin performance v4
-- Goal: replace expensive repeated admin role subqueries in policies
-- with a stable SECURITY DEFINER helper call.

SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.is_admin_user()
IS 'Fast admin check for RLS predicates.';

DO $$
DECLARE
  rec record;
  new_qual text;
  new_with_check text;
  roles_clause text;
  create_sql text;
BEGIN
  FOR rec IN
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') ILIKE '%role = ''admin''%'
        OR COALESCE(with_check, '') ILIKE '%role = ''admin''%'
      )
  LOOP
    new_qual := rec.qual;
    new_with_check := rec.with_check;

    IF new_qual IS NOT NULL THEN
      -- Variant A: EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
      new_qual := regexp_replace(
        new_qual,
        'EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(public\.)?profiles\s+[a-zA-Z_][a-zA-Z0-9_]*\s+WHERE\s*\(\([a-zA-Z_][a-zA-Z0-9_]*\.id\s*=\s*auth\.uid\(\)\)\s*AND\s*\([a-zA-Z_][a-zA-Z0-9_]*\.role\s*=\s*''admin''(::text)?\)\)\s*\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );

      -- Variant B: EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
      new_qual := regexp_replace(
        new_qual,
        'EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(public\.)?profiles\s+WHERE\s*\(\(profiles\.id\s*=\s*auth\.uid\(\)\)\s*AND\s*\(profiles\.role\s*=\s*''admin''(::text)?\)\)\s*\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );

      -- Variant C: EXISTS (SELECT 1 FROM auth.users u JOIN profiles p ON p.id=u.id WHERE u.id=auth.uid() AND p.role='admin')
      new_qual := regexp_replace(
        new_qual,
        'EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+\(\s*auth\.users\s+[a-zA-Z_][a-zA-Z0-9_]*\s+JOIN\s+(public\.)?profiles\s+[a-zA-Z_][a-zA-Z0-9_]*\s+ON\s*\(\([a-zA-Z_][a-zA-Z0-9_]*\.id\s*=\s*[a-zA-Z_][a-zA-Z0-9_]*\.id\)\)\s*\)\s*WHERE\s*\(\([a-zA-Z_][a-zA-Z0-9_]*\.id\s*=\s*auth\.uid\(\)\)\s*AND\s*\([a-zA-Z_][a-zA-Z0-9_]*\.role\s*=\s*''admin''(::text)?\)\)\s*\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );
    END IF;

    IF new_with_check IS NOT NULL THEN
      new_with_check := regexp_replace(
        new_with_check,
        'EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(public\.)?profiles\s+[a-zA-Z_][a-zA-Z0-9_]*\s+WHERE\s*\(\([a-zA-Z_][a-zA-Z0-9_]*\.id\s*=\s*auth\.uid\(\)\)\s*AND\s*\([a-zA-Z_][a-zA-Z0-9_]*\.role\s*=\s*''admin''(::text)?\)\)\s*\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );

      new_with_check := regexp_replace(
        new_with_check,
        'EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+(public\.)?profiles\s+WHERE\s*\(\(profiles\.id\s*=\s*auth\.uid\(\)\)\s*AND\s*\(profiles\.role\s*=\s*''admin''(::text)?\)\)\s*\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );

      new_with_check := regexp_replace(
        new_with_check,
        'EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+\(\s*auth\.users\s+[a-zA-Z_][a-zA-Z0-9_]*\s+JOIN\s+(public\.)?profiles\s+[a-zA-Z_][a-zA-Z0-9_]*\s+ON\s*\(\([a-zA-Z_][a-zA-Z0-9_]*\.id\s*=\s*[a-zA-Z_][a-zA-Z0-9_]*\.id\)\)\s*\)\s*WHERE\s*\(\([a-zA-Z_][a-zA-Z0-9_]*\.id\s*=\s*auth\.uid\(\)\)\s*AND\s*\([a-zA-Z_][a-zA-Z0-9_]*\.role\s*=\s*''admin''(::text)?\)\)\s*\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );
    END IF;

    IF COALESCE(new_qual, '') = COALESCE(rec.qual, '')
       AND COALESCE(new_with_check, '') = COALESCE(rec.with_check, '') THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(
      string_agg(
        CASE
          WHEN r.role_name = 'public' THEN 'PUBLIC'
          ELSE quote_ident(r.role_name)
        END,
        ', '
      ),
      'PUBLIC'
    )
    INTO roles_clause
    FROM unnest(COALESCE(rec.roles, ARRAY['public']::name[])) AS r(role_name);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      rec.policyname,
      rec.schemaname,
      rec.tablename
    );

    create_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      rec.policyname,
      rec.schemaname,
      rec.tablename,
      rec.permissive,
      rec.cmd,
      roles_clause
    );

    IF new_qual IS NOT NULL THEN
      create_sql := create_sql || format(' USING (%s)', new_qual);
    END IF;

    IF new_with_check IS NOT NULL THEN
      create_sql := create_sql || format(' WITH CHECK (%s)', new_with_check);
    END IF;

    EXECUTE create_sql;
  END LOOP;
END
$$;

-- Post-check helper query (manual run):
-- SELECT
--   COUNT(*) FILTER (WHERE COALESCE(qual,'') ILIKE '%profiles pr%' AND COALESCE(qual,'') ILIKE '%role = ''admin''%') AS admin_profiles_subquery_policies,
--   COUNT(*) FILTER (WHERE COALESCE(qual,'') ILIKE '%is_admin_user()%') AS is_admin_user_policies
-- FROM pg_policies
-- WHERE schemaname='public';

