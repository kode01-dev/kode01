-- Migration: normalize legacy AI recap seed slugs (v2-seed-*)
SET search_path = '';

WITH normalized AS (
  SELECT
    p.id,
    (
      CASE
        WHEN p.locale = 'fr' THEN 'recap-ia-'
        ELSE 'ai-weekly-recap-'
      END
    ) || COALESCE(
      NULLIF(
        trim(BOTH '-' FROM regexp_replace(lower(e.edition_key), '[^a-z0-9]+', '-', 'g')),
        ''
      ),
      substring(md5(p.id::text), 1, 8)
    ) AS new_slug
  FROM public.ai_recap_posts AS p
  INNER JOIN public.ai_recap_editions AS e ON e.id = p.edition_id
  WHERE p.slug ~ '^v2-seed-(en|fr)-[0-9]+$'
)
UPDATE public.ai_recap_posts AS p
SET slug = normalized.new_slug
FROM normalized
WHERE p.id = normalized.id
  AND p.slug IS DISTINCT FROM normalized.new_slug;
