SET search_path = '';

-- New Supabase projects stop auto-exposing public tables/functions to the Data
-- API on 2026-05-30. Kode01 uses supabase-js heavily, so the migrated project
-- must carry explicit GRANTs after the final Brain/Campus removal migration.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL ROUTINES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON ROUTINES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL PRIVILEGES ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.grant_table_if_exists(
  privileges TEXT,
  relation_name TEXT,
  role_list TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  relation_oid REGCLASS;
BEGIN
  relation_oid := to_regclass(relation_name);

  IF relation_oid IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('GRANT %s ON TABLE %s TO %s', privileges, relation_oid, role_list);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.grant_routine_if_exists(
  signature TEXT,
  role_list TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  routine_oid REGPROCEDURE;
BEGIN
  routine_oid := to_regprocedure(signature);

  IF routine_oid IS NULL THEN
    RETURN;
  END IF;

  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', routine_oid, role_list);
END;
$$;

-- Public read surface. Brain/Campus tables are intentionally absent.
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.products', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.product_categories', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.product_subcategories', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.product_bundle_items', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.product_review_stats', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.product_reviews', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.profiles', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.profile_marketplace_data', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.active_billing_entitlements', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.subscription_plans', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.vendor_badges', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.agent_blueprints', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.editorial_posts', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.ai_recap_posts', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.ai_recap_editions', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.ai_recap_sources', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.article_clap_stats', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.footer_social_links', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.homepage_layout_configs', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.site_lockscreen_config', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.ad_placements', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.ad_pricing_plans', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.ad_campaigns', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.ad_campaign_placements', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.ad_creatives', 'anon');
SELECT pg_temp.grant_table_if_exists('SELECT', 'public.seo_overrides', 'anon');

-- Anonymous telemetry writes remain table-level opt-in and still depend on RLS.
SELECT pg_temp.grant_table_if_exists('INSERT', 'public.cookie_consent_events', 'anon');
SELECT pg_temp.grant_table_if_exists('INSERT', 'public.marketing_campaign_events', 'anon');

-- Public RPC surface used by marketplace/search/home/news interactions.
SELECT pg_temp.grant_routine_if_exists('public.get_product_sales_count(uuid)', 'anon, authenticated');
SELECT pg_temp.grant_routine_if_exists('public.get_creator_sales_count(uuid)', 'anon, authenticated');
SELECT pg_temp.grant_routine_if_exists('public.get_total_sales_count()', 'anon, authenticated');
SELECT pg_temp.grant_routine_if_exists('public.list_top_deals(timestamp with time zone, integer)', 'anon, authenticated');
SELECT pg_temp.grant_routine_if_exists('public.search_market_products_page(text, integer, integer, text, text, uuid, uuid[], text[])', 'anon, authenticated');
SELECT pg_temp.grant_routine_if_exists('public.suggest_product_titles(text, integer)', 'anon, authenticated');
SELECT pg_temp.grant_routine_if_exists('public.upsert_article_clap(uuid, text, uuid, integer)', 'anon, authenticated');
SELECT pg_temp.grant_routine_if_exists('public.log_audit_event(text, uuid, jsonb, jsonb, jsonb)', 'authenticated');
