-- Products full-text + fuzzy search (Market + autocomplete)

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(slug, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_vector_gin
  ON public.products USING gin (search_vector);

CREATE INDEX IF NOT EXISTS idx_products_title_trgm
  ON public.products USING gin (title extensions.gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.search_market_products_page(
  p_query text,
  p_limit integer DEFAULT 24,
  p_offset integer DEFAULT 0,
  p_type text DEFAULT 'all',
  p_sort text DEFAULT 'newest',
  p_category_id uuid DEFAULT NULL,
  p_subcategory_ids uuid[] DEFAULT NULL,
  p_tags text[] DEFAULT NULL
)
RETURNS TABLE (
  product_ids uuid[],
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT
      trim(coalesce(p_query, '')) AS query,
      GREATEST(coalesce(p_limit, 24), 0) AS limit_value,
      GREATEST(coalesce(p_offset, 0), 0) AS offset_value,
      CASE
        WHEN p_type IN ('all', 'product', 'bundle') THEN p_type
        ELSE 'all'
      END AS type_value,
      CASE
        WHEN p_sort IN ('newest', 'price_asc', 'price_desc') THEN p_sort
        ELSE 'newest'
      END AS sort_value,
      p_category_id AS category_id_value,
      coalesce(p_subcategory_ids, ARRAY[]::uuid[]) AS subcategory_ids_value,
      coalesce(p_tags, ARRAY[]::text[]) AS tags_value
  ),
  filtered AS (
    SELECT
      p.id,
      p.search_vector,
      p.title,
      p.slug,
      p.description,
      p.price,
      p.created_at
    FROM public.products p
    CROSS JOIN params
    WHERE p.status = 'published'
      AND (
        params.type_value = 'all'
        OR (params.type_value = 'bundle' AND p.is_bundle = true)
        OR (params.type_value = 'product' AND coalesce(p.is_bundle, false) = false)
      )
      AND (
        params.category_id_value IS NULL
        OR p.category_id = params.category_id_value
      )
      AND (
        cardinality(params.subcategory_ids_value) = 0
        OR p.subcategory_id = ANY(params.subcategory_ids_value)
      )
      AND (
        cardinality(params.tags_value) = 0
        OR p.tags && params.tags_value
      )
  ),
  fts AS (
    SELECT
      f.id,
      ts_rank_cd(
        f.search_vector,
        websearch_to_tsquery('english', params.query)
      ) AS score,
      0 AS source_order,
      f.created_at,
      f.price
    FROM filtered f
    CROSS JOIN params
    WHERE params.query <> ''
      AND f.search_vector @@ websearch_to_tsquery('english', params.query)
  ),
  fts_count AS (
    SELECT COUNT(*)::integer AS count_value
    FROM fts
  ),
  trigram AS (
    SELECT
      f.id,
      GREATEST(
        extensions.similarity(f.title, params.query),
        extensions.similarity(coalesce(f.slug, ''), params.query),
        extensions.similarity(coalesce(f.description, ''), params.query)
      ) AS score,
      1 AS source_order,
      f.created_at,
      f.price
    FROM filtered f
    CROSS JOIN params
    CROSS JOIN fts_count
    WHERE params.query <> ''
      AND fts_count.count_value < 3
      AND NOT EXISTS (
        SELECT 1
        FROM fts
        WHERE fts.id = f.id
      )
      AND (
        f.title % params.query
        OR coalesce(f.slug, '') % params.query
        OR coalesce(f.description, '') % params.query
      )
  ),
  combined AS (
    SELECT id, score, source_order, created_at, price
    FROM fts
    UNION ALL
    SELECT id, score, source_order, created_at, price
    FROM trigram
  ),
  ranked AS (
    SELECT
      c.id,
      ROW_NUMBER() OVER (
        ORDER BY
          c.source_order ASC,
          c.score DESC,
          CASE WHEN params.sort_value = 'price_asc' THEN c.price END ASC NULLS LAST,
          CASE WHEN params.sort_value = 'price_desc' THEN c.price END DESC NULLS LAST,
          c.created_at DESC,
          c.id ASC
      ) AS row_num,
      COUNT(*) OVER () AS total_items
    FROM combined c
    CROSS JOIN params
  )
  SELECT
    coalesce(
      ARRAY(
        SELECT r.id
        FROM ranked r
        CROSS JOIN params
        WHERE r.row_num > params.offset_value
          AND r.row_num <= (params.offset_value + params.limit_value)
        ORDER BY r.row_num
      ),
      ARRAY[]::uuid[]
    ) AS product_ids,
    coalesce((SELECT MAX(total_items)::bigint FROM ranked), 0::bigint) AS total_count;
$$;

CREATE OR REPLACE FUNCTION public.suggest_product_titles(
  p_query text,
  p_limit integer DEFAULT 5
)
RETURNS TABLE (
  title text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH params AS (
    SELECT
      trim(coalesce(p_query, '')) AS query,
      LEAST(GREATEST(coalesce(p_limit, 5), 1), 10) AS limit_value
  ),
  ranked_titles AS (
    SELECT
      p.title,
      CASE WHEN lower(p.title) = lower(params.query) THEN 0 ELSE 1 END AS exact_priority,
      extensions.similarity(p.title, params.query) AS score,
      ROW_NUMBER() OVER (
        PARTITION BY p.title
        ORDER BY p.created_at DESC
      ) AS title_row
    FROM public.products p
    CROSS JOIN params
    WHERE p.status = 'published'
      AND params.query <> ''
      AND (
        p.title % params.query
        OR p.title ILIKE ('%' || params.query || '%')
      )
  )
  SELECT rt.title
  FROM ranked_titles rt
  WHERE rt.title_row = 1
  ORDER BY
    rt.exact_priority ASC,
    rt.score DESC,
    rt.title ASC
  LIMIT (SELECT limit_value FROM params);
$$;

GRANT EXECUTE ON FUNCTION public.search_market_products_page(text, integer, integer, text, text, uuid, uuid[], text[])
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.suggest_product_titles(text, integer)
  TO anon, authenticated;
