-- Migration: Harden maintenance SQL RPC
-- Removes the unsafe public SECURITY DEFINER function and recreates
-- a locked-down equivalent in a private schema for service_role only.

SET search_path = '';

CREATE SCHEMA IF NOT EXISTS private;

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
