-- Migration: Harden public top-deals RPC for anon/authenticated callers
-- Ensures only published products are returned while keeping RLS-safe public access.

SET search_path = '';

CREATE OR REPLACE FUNCTION public.list_top_deals(
  p_since TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 64
)
RETURNS TABLE (
  product_id UUID,
  sales_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p.product_id,
    COUNT(*)::BIGINT AS sales_count
  FROM public.purchases p
  INNER JOIN public.products pr
    ON pr.id = p.product_id
  WHERE p.status = 'completed'
    AND pr.status = 'published'
    AND (p_since IS NULL OR p.created_at >= p_since)
  GROUP BY p.product_id
  ORDER BY sales_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 64), 1), 500)
$$;

REVOKE ALL ON FUNCTION public.list_top_deals(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_top_deals(TIMESTAMPTZ, INTEGER) TO anon, authenticated, service_role;
