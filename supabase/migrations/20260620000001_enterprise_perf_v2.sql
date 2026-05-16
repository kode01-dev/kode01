-- Enterprise performance hardening (Market + Directory + Blog/News + Dashboard + Recommendations)

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- PRODUCTS: filters/sort/search and seller analytics
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_products_status_created_at_desc
  ON public.products (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_status_price
  ON public.products (status, price);

CREATE INDEX IF NOT EXISTS idx_products_status_category_created_at_desc
  ON public.products (status, category_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_status_subcategory_created_at_desc
  ON public.products (status, subcategory_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_seller_created_at_desc
  ON public.products (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_tags_gin
  ON public.products USING gin (tags);

CREATE INDEX IF NOT EXISTS idx_products_title_trgm
  ON public.products USING gin (title extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_description_trgm
  ON public.products USING gin (description extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_products_slug_trgm
  ON public.products USING gin (slug extensions.gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- MODULES DIRECTORY: filters/sort/search
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_modules_directory_type_created_at_desc
  ON public.modules_directory (type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_modules_directory_type_technical_type
  ON public.modules_directory (type, technical_type);

CREATE INDEX IF NOT EXISTS idx_modules_directory_type_is_free
  ON public.modules_directory (type, is_free);

CREATE INDEX IF NOT EXISTS idx_modules_directory_stars_created_at_desc
  ON public.modules_directory (stars_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_modules_directory_views_created_at_desc
  ON public.modules_directory (views_count DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_modules_directory_ai_tags_gin
  ON public.modules_directory USING gin (ai_tags);

CREATE INDEX IF NOT EXISTS idx_modules_directory_search_vector_gin
  ON public.modules_directory USING gin (search_vector);

-- ---------------------------------------------------------------------------
-- AI RESOURCES: approved-only access patterns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_resources_approved_created_at_desc
  ON public.ai_resources (created_at DESC)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_approved_technical_type
  ON public.ai_resources (technical_type)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_approved_ai_domain
  ON public.ai_resources (ai_domain)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_approved_provider
  ON public.ai_resources (provider)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_approved_ai_tags_gin
  ON public.ai_resources USING gin (ai_tags)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_title_trgm_approved
  ON public.ai_resources USING gin (title extensions.gin_trgm_ops)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_description_trgm_approved
  ON public.ai_resources USING gin (description extensions.gin_trgm_ops)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_ai_description_trgm_approved
  ON public.ai_resources USING gin (ai_description extensions.gin_trgm_ops)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_slug_trgm_approved
  ON public.ai_resources USING gin (slug extensions.gin_trgm_ops)
  WHERE is_approved = true;

CREATE INDEX IF NOT EXISTS idx_ai_resources_provider_trgm_approved
  ON public.ai_resources USING gin (provider extensions.gin_trgm_ops)
  WHERE is_approved = true;

-- ---------------------------------------------------------------------------
-- AI RECAP POSTS: locale + publication windows
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_recap_posts_locale_published_at_desc
  ON public.ai_recap_posts (locale, is_published, published_at DESC);

-- ---------------------------------------------------------------------------
-- PURCHASES / PRODUCT VIEWS: analytics access paths
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_purchases_seller_created_at_desc
  ON public.purchases (seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_product_status_created_at_desc
  ON public.purchases (product_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchases_buyer_product_status
  ON public.purchases (buyer_id, product_id, status);

CREATE INDEX IF NOT EXISTS idx_product_views_product_view_date_desc
  ON public.product_views (product_id, view_date DESC);

CREATE INDEX IF NOT EXISTS idx_product_views_view_date_product
  ON public.product_views (view_date DESC, product_id);

-- ---------------------------------------------------------------------------
-- Dashboard analytics RPC (last 30 days) - front payload stays unchanged
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_seller_analytics_30d(p_seller_id uuid)
RETURNS TABLE (
  chart_data jsonb,
  total_revenue numeric,
  total_sales bigint,
  total_views bigint,
  conversion_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      current_date - INTERVAL '29 days',
      current_date,
      INTERVAL '1 day'
    )::date AS day
  ),
  sales AS (
    SELECT
      created_at::date AS day,
      COUNT(*)::bigint AS sales,
      COALESCE(SUM(amount), 0)::numeric AS revenue
    FROM public.purchases
    WHERE seller_id = p_seller_id
      AND created_at >= (current_date - INTERVAL '29 days')
    GROUP BY created_at::date
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
$$;

GRANT EXECUTE ON FUNCTION public.get_seller_analytics_30d(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Recommendations pre-aggregate (90 days)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_popularity_agg_90d (
  product_id uuid PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  sales_90d integer NOT NULL DEFAULT 0,
  views_90d integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.refresh_product_popularity_agg_90d()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_popularity_agg_90d (product_id, sales_90d, views_90d, updated_at)
  SELECT
    p.id AS product_id,
    COALESCE(s.sales_90d, 0)::integer AS sales_90d,
    COALESCE(v.views_90d, 0)::integer AS views_90d,
    now() AS updated_at
  FROM public.products p
  LEFT JOIN (
    SELECT
      product_id,
      COUNT(*) AS sales_90d
    FROM public.purchases
    WHERE status = 'completed'
      AND created_at >= (now() - INTERVAL '90 days')
    GROUP BY product_id
  ) s ON s.product_id = p.id
  LEFT JOIN (
    SELECT
      product_id,
      COALESCE(SUM(count), 0) AS views_90d
    FROM public.product_views
    WHERE view_date >= (current_date - INTERVAL '90 days')::date
    GROUP BY product_id
  ) v ON v.product_id = p.id
  WHERE p.status = 'published'
  ON CONFLICT (product_id) DO UPDATE SET
    sales_90d = EXCLUDED.sales_90d,
    views_90d = EXCLUDED.views_90d,
    updated_at = EXCLUDED.updated_at;

  DELETE FROM public.product_popularity_agg_90d agg
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.products p
    WHERE p.id = agg.product_id
      AND p.status = 'published'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_product_popularity_agg_90d() TO service_role;

CREATE OR REPLACE FUNCTION public.get_perf_observability_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blks_read bigint := 0;
  v_blks_hit bigint := 0;
  v_tup_returned bigint := 0;
  v_tup_fetched bigint := 0;
  v_cache_hit_ratio numeric := 0;
BEGIN
  SELECT
    COALESCE(blks_read, 0),
    COALESCE(blks_hit, 0),
    COALESCE(tup_returned, 0),
    COALESCE(tup_fetched, 0)
  INTO
    v_blks_read,
    v_blks_hit,
    v_tup_returned,
    v_tup_fetched
  FROM pg_stat_database
  WHERE datname = current_database();

  IF (v_blks_hit + v_blks_read) > 0 THEN
    v_cache_hit_ratio := ROUND((v_blks_hit::numeric * 100.0) / (v_blks_hit + v_blks_read)::numeric, 2);
  END IF;

  RETURN jsonb_build_object(
    'database', jsonb_build_object(
      'blks_read', v_blks_read,
      'blks_hit', v_blks_hit,
      'cache_hit_ratio_percent', v_cache_hit_ratio,
      'tup_returned', v_tup_returned,
      'tup_fetched', v_tup_fetched
    ),
    'captured_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_perf_observability_snapshot() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_perf_observability_snapshot() TO service_role;

SELECT public.refresh_product_popularity_agg_90d();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_extension
    WHERE extname = 'pg_cron'
  ) THEN
    BEGIN
      PERFORM cron.unschedule('refresh-product-popularity-agg-90d');
    EXCEPTION
      WHEN others THEN
        NULL;
    END;

    PERFORM cron.schedule(
      'refresh-product-popularity-agg-90d',
      '*/20 * * * *',
      $job$SELECT public.refresh_product_popularity_agg_90d();$job$
    );
  END IF;
END
$$;
