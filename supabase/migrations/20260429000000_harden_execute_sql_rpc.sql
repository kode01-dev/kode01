-- Migration: Backfill hardening for execute_sql RPC on already-migrated databases
-- KODE-SEC-013: eliminate public dynamic SQL execution and restrict private RPC access.

SET search_path = '';

CREATE SCHEMA IF NOT EXISTS private;

DO $$
BEGIN
  IF to_regprocedure('public.execute_sql(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.execute_sql(text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.execute_sql(text) FROM anon;
    REVOKE ALL ON FUNCTION public.execute_sql(text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.execute_sql(text) FROM service_role;
  END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.execute_sql(text);

CREATE OR REPLACE FUNCTION private.execute_sql(sql_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sanitized_query text;
  result json;
BEGIN
  IF sql_query IS NULL OR btrim(sql_query) = '' THEN
    RAISE EXCEPTION 'sql_query is required';
  END IF;

  sanitized_query := rtrim(sql_query, ';');

  IF sanitized_query !~* '^\s*select\b' THEN
    RAISE EXCEPTION 'only SELECT statements are allowed';
  END IF;

  IF sanitized_query ~ ';' THEN
    RAISE EXCEPTION 'multiple statements are not allowed';
  END IF;

  EXECUTE format(
    'SELECT coalesce(json_agg(t), ''[]''::json) FROM (%s) t',
    sanitized_query
  ) INTO result;

  RETURN coalesce(result, '[]'::json);
END;
$$;

REVOKE ALL ON FUNCTION private.execute_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.execute_sql(text) FROM anon;
REVOKE ALL ON FUNCTION private.execute_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION private.execute_sql(text) TO service_role;
