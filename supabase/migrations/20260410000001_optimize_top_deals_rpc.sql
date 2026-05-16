-- Migration: Optimize top-deals endpoint with server-side aggregation

SET search_path = '';

CREATE INDEX IF NOT EXISTS idx_purchases_status_created_product
  ON public.purchases(status, created_at DESC, product_id);

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
  WHERE p.status = 'completed'
    AND (p_since IS NULL OR p.created_at >= p_since)
  GROUP BY p.product_id
  ORDER BY sales_count DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 64), 1), 500)
$$;

REVOKE ALL ON FUNCTION public.list_top_deals(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_top_deals(TIMESTAMPTZ, INTEGER) TO service_role;

