-- Run in Supabase SQL editor on production-like data.
-- Goal: verify index usage and reduce shared_blks_read.

-- Market list (initial page, with facets/total)
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  id, slug, title, description, price, is_bundle, cover_image_url, tags, category_id, subcategory_id, created_at
FROM public.products
WHERE status = 'published'
ORDER BY created_at DESC
LIMIT 24;

-- Market search path
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, slug, title
FROM public.products
WHERE status = 'published'
  AND (title ILIKE '%agent%' OR description ILIKE '%agent%' OR slug ILIKE '%agent%')
ORDER BY created_at DESC
LIMIT 24;

-- Dashboard analytics RPC
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM public.get_seller_analytics_30d('00000000-0000-0000-0000-000000000000'::uuid);

-- Recommendations popularity pre-aggregate read
EXPLAIN (ANALYZE, BUFFERS)
SELECT product_id, sales_90d, views_90d
FROM public.product_popularity_agg_90d
ORDER BY sales_90d DESC
LIMIT 100;
