-- Migration: Create secure public sales count functions
-- SOC 2: SECURITY DEFINER with restricted access, search_path hardened

SET search_path = '';

-- Function to get sales count for a specific product
CREATE OR REPLACE FUNCTION public.get_product_sales_count(p_product_id UUID)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.purchases
  WHERE product_id = p_product_id
    AND status = 'completed';
$$;

-- Function to get sales count for a specific creator (seller)
CREATE OR REPLACE FUNCTION public.get_creator_sales_count(p_seller_id UUID)
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.purchases
  WHERE seller_id = p_seller_id
    AND status = 'completed';
$$;

-- Function to get total platform sales count
CREATE OR REPLACE FUNCTION public.get_total_sales_count()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COUNT(*)::BIGINT
  FROM public.purchases
  WHERE status = 'completed';
$$;

-- Permissions: Allow public (anon) and authenticated users to call these specific functions
REVOKE ALL ON FUNCTION public.get_product_sales_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_sales_count(UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_creator_sales_count(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_creator_sales_count(UUID) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_total_sales_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_total_sales_count() TO anon, authenticated, service_role;
