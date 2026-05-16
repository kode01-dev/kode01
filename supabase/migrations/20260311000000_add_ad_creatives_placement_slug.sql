SET search_path = '';

DO $$
BEGIN
  IF to_regclass('public.ad_creatives') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.ad_creatives
    ADD COLUMN IF NOT EXISTS placement_slug TEXT CHECK (placement_slug IN ('news', 'newsletter_footer'));

  ALTER TABLE public.ad_creatives
    ADD COLUMN IF NOT EXISTS page_count INTEGER NOT NULL DEFAULT 1 CHECK (page_count > 0 AND page_count <= 500);

  WITH inferred AS (
    SELECT
      ac.id AS creative_id,
      CASE
        WHEN bool_or(ap.slug = 'news') THEN 'news'
        WHEN bool_or(ap.slug = 'newsletter_footer') THEN 'newsletter_footer'
        ELSE NULL
      END AS inferred_slug
    FROM public.ad_creatives ac
    JOIN public.ad_campaign_placements cp ON cp.campaign_id = ac.campaign_id
    JOIN public.ad_placements ap ON ap.id = cp.placement_id
    GROUP BY ac.id
  )
  UPDATE public.ad_creatives ac
  SET placement_slug = inferred.inferred_slug
  FROM inferred
  WHERE ac.id = inferred.creative_id
    AND ac.placement_slug IS NULL
    AND inferred.inferred_slug IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_placement
    ON public.ad_creatives(campaign_id, placement_slug);
END $$;
