-- Harden security scan findings without rewriting historical migrations.

SET search_path = '';

-- ---------------------------------------------------------------------------
-- Cart price snapshots are display data, not pricing authority.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_cart_item_price_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product_price numeric;
  v_min_price numeric;
  v_is_pwyw boolean;
  v_variant_price numeric;
  v_server_price numeric;
  v_requested_price numeric;
BEGIN
  SELECT p.price, COALESCE(p.min_price, 0), COALESCE(p.is_pwyw, false)
  INTO v_product_price, v_min_price, v_is_pwyw
  FROM public.products p
  WHERE p.id = NEW.product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cart item product not found'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.variant_id IS NOT NULL THEN
    SELECT pv.price_override
    INTO v_variant_price
    FROM public.product_variants pv
    WHERE pv.id = NEW.variant_id
      AND pv.product_id = NEW.product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'cart item variant not found for product'
        USING ERRCODE = '23503';
    END IF;
  END IF;

  v_server_price := round(COALESCE(v_variant_price, v_product_price, 0), 2);

  IF v_is_pwyw THEN
    v_requested_price := round(COALESCE(NEW.price_snapshot, v_server_price), 2);
    IF v_requested_price < GREATEST(v_min_price, v_server_price) THEN
      RAISE EXCEPTION 'cart item price is below the allowed minimum'
        USING ERRCODE = '23514';
    END IF;
    NEW.price_snapshot := v_requested_price;
  ELSE
    NEW.price_snapshot := v_server_price;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_cart_item_price_snapshot_before_write ON public.cart_items;
CREATE TRIGGER normalize_cart_item_price_snapshot_before_write
  BEFORE INSERT OR UPDATE OF product_id, variant_id, price_snapshot
  ON public.cart_items
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_cart_item_price_snapshot();

REVOKE ALL ON FUNCTION public.normalize_cart_item_price_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_cart_item_price_snapshot() TO service_role;

-- ---------------------------------------------------------------------------
-- Seller analytics may only be requested by the seller represented by auth.uid.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_seller_analytics_30d(p_seller_id uuid)
RETURNS TABLE (
  chart_data jsonb,
  total_revenue numeric,
  total_sales bigint,
  total_views bigint,
  conversion_rate numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_seller_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'seller analytics forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT generate_series(
      current_date - INTERVAL '29 days',
      current_date,
      INTERVAL '1 day'
    )::date AS day
  ),
  sales AS (
    SELECT
      p.created_at::date AS day,
      COUNT(*)::bigint AS sales,
      COALESCE(SUM(p.amount), 0)::numeric AS revenue
    FROM public.purchases p
    WHERE p.seller_id = p_seller_id
      AND p.created_at >= (current_date - INTERVAL '29 days')
    GROUP BY p.created_at::date
  ),
  views AS (
    SELECT
      pv.view_date::date AS day,
      COALESCE(SUM(pv.count), 0)::bigint AS views
    FROM public.product_views pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE p.seller_id = p_seller_id
      AND pv.view_date >= (current_date - INTERVAL '29 days')::date
    GROUP BY pv.view_date::date
  ),
  daily AS (
    SELECT
      d.day,
      COALESCE(s.sales, 0)::bigint AS sales,
      COALESCE(s.revenue, 0)::numeric AS revenue,
      COALESCE(v.views, 0)::bigint AS views
    FROM days d
    LEFT JOIN sales s ON s.day = d.day
    LEFT JOIN views v ON v.day = d.day
    ORDER BY d.day
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'date', to_char(d.day, 'YYYY-MM-DD'),
          'sales', d.sales,
          'revenue', d.revenue,
          'views', d.views
        )
        ORDER BY d.day
      ),
      '[]'::jsonb
    ) AS chart_data,
    COALESCE(SUM(d.revenue), 0)::numeric AS total_revenue,
    COALESCE(SUM(d.sales), 0)::bigint AS total_sales,
    COALESCE(SUM(d.views), 0)::bigint AS total_views,
    CASE
      WHEN COALESCE(SUM(d.views), 0) > 0
        THEN ROUND((COALESCE(SUM(d.sales), 0)::numeric * 100) / COALESCE(SUM(d.views), 0)::numeric, 1)
      ELSE 0
    END AS conversion_rate
  FROM daily d;
END;
$$;

REVOKE ALL ON FUNCTION public.get_seller_analytics_30d(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_analytics_30d(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Clap writes must go through the server route that derives identity and limits.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.upsert_article_clap(uuid, text, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_article_clap(uuid, text, uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- The public marketplace profile view is not used by the app and can bypass RLS.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.profile_marketplace_data') IS NOT NULL THEN
    ALTER VIEW public.profile_marketplace_data SET (security_invoker = true);
    REVOKE ALL ON TABLE public.profile_marketplace_data FROM PUBLIC, anon, authenticated;
  END IF;
END;
$$;
