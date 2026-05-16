-- Enterprise IO safety v3
-- Focus:
-- 1) Remove duplicate indexes that add write overhead.
-- 2) Add missing FK indexes for join/delete/update paths.
-- 3) Optimize directory view counter write path.
-- 4) Rewrite RLS admin predicates to use cached helper function call.

SET search_path = '';

-- ---------------------------------------------------------------------------
-- 1) Drop duplicate indexes (keep unique/constraint-backed equivalents)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_affiliates_code;
DROP INDEX IF EXISTS public.idx_ai_recap_posts_edition;
DROP INDEX IF EXISTS public.idx_license_keys_key;
DROP INDEX IF EXISTS public.idx_modules_directory_search;
DROP INDEX IF EXISTS public.idx_modules_directory_type_created_at;
DROP INDEX IF EXISTS public.idx_product_views_product_view_date_desc;
DROP INDEX IF EXISTS public.idx_products_slug;

-- ---------------------------------------------------------------------------
-- 2) Missing FK indexes (from live catalog audit)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ad_campaign_placements_placement_id
  ON public.ad_campaign_placements (placement_id);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_approved_by
  ON public.ad_campaigns (approved_by);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_pricing_plan_id
  ON public.ad_campaigns (pricing_plan_id);

CREATE INDEX IF NOT EXISTS idx_ad_events_creative_id
  ON public.ad_events (creative_id);

CREATE INDEX IF NOT EXISTS idx_ad_events_placement_id
  ON public.ad_events (placement_id);

CREATE INDEX IF NOT EXISTS idx_ai_recap_documents_source_id
  ON public.ai_recap_documents (source_id);

CREATE INDEX IF NOT EXISTS idx_ai_recap_editions_run_id
  ON public.ai_recap_editions (run_id);

CREATE INDEX IF NOT EXISTS idx_directory_sync_followup_queue_linked_run_id
  ON public.directory_sync_followup_queue (linked_run_id);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_created_by
  ON public.editorial_posts (created_by);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_sponsored_approved_by
  ON public.editorial_posts (sponsored_approved_by);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_sponsored_rejected_by
  ON public.editorial_posts (sponsored_rejected_by);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_updated_by
  ON public.editorial_posts (updated_by);

CREATE INDEX IF NOT EXISTS idx_homepage_layout_configs_published_by
  ON public.homepage_layout_configs (published_by);

CREATE INDEX IF NOT EXISTS idx_homepage_layout_configs_updated_by
  ON public.homepage_layout_configs (updated_by);

CREATE INDEX IF NOT EXISTS idx_license_activation_events_product_id
  ON public.license_activation_events (product_id);

CREATE INDEX IF NOT EXISTS idx_license_activation_events_purchase_id
  ON public.license_activation_events (purchase_id);

CREATE INDEX IF NOT EXISTS idx_license_webhook_deliveries_license_key_id
  ON public.license_webhook_deliveries (license_key_id);

CREATE INDEX IF NOT EXISTS idx_license_webhook_deliveries_product_id
  ON public.license_webhook_deliveries (product_id);

CREATE INDEX IF NOT EXISTS idx_license_webhook_deliveries_purchase_id
  ON public.license_webhook_deliveries (purchase_id);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_created_by
  ON public.marketing_campaigns (created_by);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_updated_by
  ON public.marketing_campaigns (updated_by);

CREATE INDEX IF NOT EXISTS idx_purchase_incident_actions_actor_user_id
  ON public.purchase_incident_actions (actor_user_id);

CREATE INDEX IF NOT EXISTS idx_purchase_incidents_assigned_admin_id
  ON public.purchase_incidents (assigned_admin_id);

CREATE INDEX IF NOT EXISTS idx_purchase_incidents_product_id
  ON public.purchase_incidents (product_id);

CREATE INDEX IF NOT EXISTS idx_purchases_affiliate_id
  ON public.purchases (affiliate_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_buyer_id
  ON public.scheduled_emails (buyer_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_purchase_id
  ON public.scheduled_emails (purchase_id);

CREATE INDEX IF NOT EXISTS idx_seo_overrides_updated_by
  ON public.seo_overrides (updated_by);

CREATE INDEX IF NOT EXISTS idx_site_lockscreen_config_updated_by
  ON public.site_lockscreen_config (updated_by);

-- ---------------------------------------------------------------------------
-- 3) Directory views write-path optimization
--    Old implementation recomputed SUM(directory_views.count) on every hit.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_directory_views(p_directory_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.directory_views (directory_id, view_date, count)
  VALUES (p_directory_id, CURRENT_DATE, 1)
  ON CONFLICT (directory_id, view_date)
  DO UPDATE SET count = public.directory_views.count + 1;

  UPDATE public.modules_directory
  SET views_count = COALESCE(views_count, 0) + 1
  WHERE id = p_directory_id;
END;
$$;

-- One-time consistency sync to avoid drift from older function versions.
WITH aggregated AS (
  SELECT directory_id, COALESCE(SUM(count), 0)::integer AS total_views
  FROM public.directory_views
  GROUP BY directory_id
)
UPDATE public.modules_directory md
SET views_count = aggregated.total_views
FROM aggregated
WHERE md.id = aggregated.directory_id
  AND COALESCE(md.views_count, 0) <> aggregated.total_views;

UPDATE public.modules_directory md
SET views_count = 0
WHERE COALESCE(md.views_count, 0) <> 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.directory_views dv
    WHERE dv.directory_id = md.id
  );

-- ---------------------------------------------------------------------------
-- 4) RLS predicate hardening:
--    Replace repeated admin EXISTS(subquery on profiles) by helper call.
--    This avoids running the same lookup expression per-row in many policies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin_user()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
  );
$$;

DO $$
DECLARE
  rec record;
  new_qual text;
  new_with_check text;
  roles_clause text;
  create_sql text;
BEGIN
  FOR rec IN
    SELECT
      schemaname,
      tablename,
      policyname,
      permissive,
      roles,
      cmd,
      qual,
      with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        COALESCE(qual, '') ILIKE '%role = ''admin''%'
        OR COALESCE(with_check, '') ILIKE '%role = ''admin''%'
      )
  LOOP
    new_qual := rec.qual;
    new_with_check := rec.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(
        new_qual,
        'EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+(public\\.)?profiles\\s+WHERE\\s*\\(\\(profiles\\.id\\s*=\\s*auth\\.uid\\(\\)\\)\\s*AND\\s*\\(profiles\\.role\\s*=\\s*''admin''::text\\)\\)\\s*\\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );
      new_qual := regexp_replace(
        new_qual,
        'EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+(public\\.)?profiles\\s+[a-zA-Z_][a-zA-Z0-9_]*\\s+WHERE\\s*\\(\\([a-zA-Z_][a-zA-Z0-9_]*\\.id\\s*=\\s*auth\\.uid\\(\\)\\)\\s*AND\\s*\\([a-zA-Z_][a-zA-Z0-9_]*\\.role\\s*=\\s*''admin''::text\\)\\)\\s*\\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );
    END IF;

    IF new_with_check IS NOT NULL THEN
      new_with_check := regexp_replace(
        new_with_check,
        'EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+(public\\.)?profiles\\s+WHERE\\s*\\(\\(profiles\\.id\\s*=\\s*auth\\.uid\\(\\)\\)\\s*AND\\s*\\(profiles\\.role\\s*=\\s*''admin''::text\\)\\)\\s*\\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );
      new_with_check := regexp_replace(
        new_with_check,
        'EXISTS\\s*\\(\\s*SELECT\\s+1\\s+FROM\\s+(public\\.)?profiles\\s+[a-zA-Z_][a-zA-Z0-9_]*\\s+WHERE\\s*\\(\\([a-zA-Z_][a-zA-Z0-9_]*\\.id\\s*=\\s*auth\\.uid\\(\\)\\)\\s*AND\\s*\\([a-zA-Z_][a-zA-Z0-9_]*\\.role\\s*=\\s*''admin''::text\\)\\)\\s*\\)',
        '(SELECT public.is_admin_user())',
        'gi'
      );
    END IF;

    IF COALESCE(new_qual, '') = COALESCE(rec.qual, '')
       AND COALESCE(new_with_check, '') = COALESCE(rec.with_check, '') THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(
      string_agg(
        CASE
          WHEN role_name = 'public' THEN 'PUBLIC'
          ELSE quote_ident(role_name)
        END,
        ', '
      ),
      'PUBLIC'
    )
    INTO roles_clause
    FROM unnest(rec.roles) AS r(role_name);

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      rec.policyname,
      rec.schemaname,
      rec.tablename
    );

    create_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      rec.policyname,
      rec.schemaname,
      rec.tablename,
      rec.permissive,
      rec.cmd,
      roles_clause
    );

    IF new_qual IS NOT NULL THEN
      create_sql := create_sql || format(' USING (%s)', new_qual);
    END IF;

    IF new_with_check IS NOT NULL THEN
      create_sql := create_sql || format(' WITH CHECK (%s)', new_with_check);
    END IF;

    EXECUTE create_sql;
  END LOOP;
END
$$;

ANALYZE public.modules_directory;
ANALYZE public.directory_views;
ANALYZE public.ai_resources;
ANALYZE public.ai_recap_documents;
ANALYZE public.bot_activity;
