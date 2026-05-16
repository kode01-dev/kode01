-- Fix marketing context RPC to support JSONB arrays correctly
-- Location: supabase/migrations/20260325000003_fix_marketing_rpc.sql

CREATE OR REPLACE FUNCTION get_active_campaigns_for_context(
  p_page_url TEXT,
  p_locale TEXT,
  p_user_role TEXT DEFAULT 'all',
  p_device_type TEXT DEFAULT 'desktop'
)
RETURNS TABLE(
  campaign_id UUID,
  template_type marketing_template_type,
  title TEXT,
  body TEXT,
  cta_text TEXT,
  cta_url TEXT,
  image_url TEXT,
  custom_config JSONB,
  trigger_type marketing_trigger_type,
  trigger_config JSONB,
  priority INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    t.template_type,
    CASE WHEN p_locale = 'fr' THEN c.title_fr ELSE c.title_en END,
    CASE WHEN p_locale = 'fr' THEN c.body_fr ELSE c.body_en END,
    CASE WHEN p_locale = 'fr' THEN c.cta_text_fr ELSE c.cta_text_en END,
    c.cta_url,
    c.image_url,
    c.custom_config,
    c.trigger_type,
    c.trigger_config,
    c.priority
  FROM public.marketing_campaigns c
  LEFT JOIN public.marketing_templates t ON t.id = c.template_id
  WHERE c.status = 'active'
    AND (c.start_at IS NULL OR c.start_at <= now())
    AND (c.end_at IS NULL OR c.end_at >= now())
    -- Fix: Use JSONB existence operator (?) instead of ANY for JSONB arrays
    AND c.targeting_rules->'locales' ? p_locale
    AND c.targeting_rules->'deviceTypes' ? p_device_type
    AND (
      c.targeting_rules->'pages' = '[]'::jsonb
      OR c.targeting_rules->'pages' ? p_page_url
    )
    AND NOT (
      c.targeting_rules->'excludePages' != '[]'::jsonb
      AND c.targeting_rules->'excludePages' ? p_page_url
    )
  ORDER BY c.priority DESC, c.created_at DESC;
END;
$$;
