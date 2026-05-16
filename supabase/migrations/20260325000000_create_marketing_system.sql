-- ============================================
-- MARKETING SYSTEM - COMPLETE SETUP
-- ============================================

-- 1. ENUMS & TYPES
-- ============================================

CREATE TYPE marketing_template_type AS ENUM (
  'popup_center',
  'popup_corner_br',
  'popup_corner_bl',
  'banner_top',
  'banner_inline',
  'banner_floating',
  'newsletter_form',
  'announcement',
  'promotional'
);

CREATE TYPE marketing_trigger_type AS ENUM (
  'page_load',
  'scroll_depth',
  'time_delay',
  'exit_intent',
  'manual'
);

CREATE TYPE marketing_campaign_status AS ENUM (
  'draft',
  'scheduled',
  'active',
  'paused',
  'completed',
  'archived'
);

-- ============================================
-- MARKETING TEMPLATES (Gabarits préfabriqués)
-- ============================================

CREATE TABLE marketing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_fr TEXT NOT NULL,
  description_en TEXT,
  description_fr TEXT,

  -- Template configuration
  template_type marketing_template_type NOT NULL,
  preview_image_url TEXT,

  -- Default design settings (JSON)
  default_config JSONB NOT NULL DEFAULT '{
    "colors": {
      "background": "#FFFFFF",
      "text": "#000000",
      "primary": "#FF006B",
      "secondary": "#0066FF"
    },
    "typography": {
      "titleFont": "serif",
      "bodyFont": "sans"
    },
    "spacing": {
      "padding": "32px",
      "gap": "16px"
    },
    "animation": {
      "entrance": "fade-in zoom-in-95",
      "duration": "200ms"
    }
  }'::jsonb,

  -- Layout structure (JSON schema)
  layout_schema JSONB NOT NULL,

  is_active BOOLEAN NOT NULL DEFAULT true,
  display_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- MARKETING CAMPAIGNS (Instances actives)
-- ============================================

CREATE TABLE marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES marketing_templates(id) ON DELETE SET NULL,

  -- Campaign metadata
  name TEXT NOT NULL,
  status marketing_campaign_status NOT NULL DEFAULT 'draft',

  -- Bilingual content
  title_en TEXT NOT NULL,
  title_fr TEXT NOT NULL,
  body_en TEXT,
  body_fr TEXT,
  cta_text_en TEXT,
  cta_text_fr TEXT,
  cta_url TEXT,

  -- Content locales metadata (like directory items)
  content_locales TEXT[] NOT NULL DEFAULT ARRAY['en']::TEXT[],
  content_source_locale TEXT CHECK (content_source_locale IN ('en', 'fr')),

  -- Media
  image_url TEXT,
  background_image_url TEXT,

  -- Custom styling overrides
  custom_config JSONB DEFAULT '{}'::jsonb,

  -- Scheduling
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,

  -- Targeting rules
  targeting_rules JSONB DEFAULT '{
    "pages": [],
    "excludePages": [],
    "userRoles": ["all"],
    "locales": ["en", "fr"],
    "deviceTypes": ["desktop", "mobile", "tablet"]
  }'::jsonb,

  -- Display settings
  trigger_type marketing_trigger_type NOT NULL DEFAULT 'page_load',
  trigger_config JSONB DEFAULT '{
    "delay": 2000,
    "scrollDepth": 50,
    "showOnce": false,
    "cooldownHours": 24
  }'::jsonb,

  -- Priority (higher = shown first if multiple match)
  priority INTEGER NOT NULL DEFAULT 0,

  -- Analytics
  view_count INTEGER NOT NULL DEFAULT 0,
  click_count INTEGER NOT NULL DEFAULT 0,
  conversion_count INTEGER NOT NULL DEFAULT 0,

  -- Ownership
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- CAMPAIGN EVENTS (Analytics tracking)
-- ============================================

CREATE TABLE marketing_campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,

  event_type TEXT NOT NULL CHECK (event_type IN (
    'view', 'click', 'close', 'conversion', 'form_submit'
  )),

  -- Context
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  fingerprint TEXT, -- For deduplication (device fingerprint)
  locale TEXT NOT NULL,
  page_url TEXT,
  device_type TEXT,

  -- Additional data
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- USER MARKETING PREFERENCES (Opt-out tracking)
-- ============================================

CREATE TABLE user_marketing_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT, -- For anonymous users

  -- Preferences
  marketing_enabled BOOLEAN NOT NULL DEFAULT true,
  newsletter_popups_enabled BOOLEAN NOT NULL DEFAULT true,
  promotional_banners_enabled BOOLEAN NOT NULL DEFAULT true,

  -- Campaign-specific dismissals
  dismissed_campaigns JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT user_or_session_required CHECK (
    user_id IS NOT NULL OR session_id IS NOT NULL
  ),
  UNIQUE (user_id),
  UNIQUE (session_id)
);

-- ============================================
-- INDEXES - Performance Optimization
-- ============================================

CREATE INDEX idx_marketing_campaigns_status ON marketing_campaigns(status);
CREATE INDEX idx_marketing_campaigns_schedule ON marketing_campaigns(start_at, end_at)
  WHERE status IN ('scheduled', 'active');
CREATE INDEX idx_marketing_campaigns_template ON marketing_campaigns(template_id);
CREATE INDEX idx_marketing_campaigns_priority ON marketing_campaigns(priority DESC);

CREATE INDEX idx_marketing_campaign_events_campaign ON marketing_campaign_events(campaign_id);
CREATE INDEX idx_marketing_campaign_events_type ON marketing_campaign_events(event_type);
CREATE INDEX idx_marketing_campaign_events_created ON marketing_campaign_events(created_at DESC);
CREATE INDEX idx_marketing_campaign_events_fingerprint ON marketing_campaign_events(fingerprint, campaign_id, event_type);
CREATE INDEX idx_marketing_campaign_events_user ON marketing_campaign_events(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_marketing_user_prefs_user ON user_marketing_preferences(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_marketing_user_prefs_session ON user_marketing_preferences(session_id) WHERE session_id IS NOT NULL;

-- GIN index for JSONB queries
CREATE INDEX idx_marketing_campaigns_targeting ON marketing_campaigns USING gin(targeting_rules);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE marketing_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_campaign_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_marketing_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================
-- TEMPLATES: Admin full access, public read active only
-- ============================================

CREATE POLICY "Admin full access to templates"
  ON marketing_templates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      INNER JOIN public.profiles p ON p.id = u.id
      WHERE u.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Public read active templates"
  ON marketing_templates FOR SELECT
  USING (is_active = true);

-- ============================================
-- CAMPAIGNS: Admin full access, public read active
-- ============================================

CREATE POLICY "Admin full access to campaigns"
  ON marketing_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      INNER JOIN public.profiles p ON p.id = u.id
      WHERE u.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Public read active campaigns"
  ON marketing_campaigns FOR SELECT
  USING (
    status = 'active'
    AND (start_at IS NULL OR start_at <= now())
    AND (end_at IS NULL OR end_at >= now())
  );

-- ============================================
-- EVENTS: Anyone can insert (with consent check in app)
-- Admin can read all
-- ============================================

CREATE POLICY "Anyone can track events"
  ON marketing_campaign_events FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admin read all events"
  ON marketing_campaign_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      INNER JOIN public.profiles p ON p.id = u.id
      WHERE u.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================
-- PREFERENCES: Users manage their own, admins read all
-- ============================================

CREATE POLICY "Users manage own preferences"
  ON user_marketing_preferences FOR ALL
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM auth.users u
      INNER JOIN public.profiles p ON p.id = u.id
      WHERE u.id = auth.uid() AND p.role = 'admin'
    )
  );

-- ============================================
-- FUNCTIONS
-- ============================================

-- Increment view count
CREATE OR REPLACE FUNCTION increment_campaign_views(campaign_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE marketing_campaigns
  SET view_count = view_count + 1
  WHERE id = campaign_uuid;
END;
$$;

-- Increment click count
CREATE OR REPLACE FUNCTION increment_campaign_clicks(campaign_uuid UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE marketing_campaigns
  SET click_count = click_count + 1
  WHERE id = campaign_uuid;
END;
$$;

-- Get active campaigns for a specific page/context
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
  FROM marketing_campaigns c
  LEFT JOIN marketing_templates t ON t.id = c.template_id
  WHERE c.status = 'active'
    AND (c.start_at IS NULL OR c.start_at <= now())
    AND (c.end_at IS NULL OR c.end_at >= now())
    AND p_locale = ANY(c.targeting_rules->'locales')
    AND p_device_type = ANY(c.targeting_rules->'deviceTypes')
    AND (
      c.targeting_rules->'pages' = '[]'::jsonb
      OR p_page_url = ANY(SELECT jsonb_array_elements_text(c.targeting_rules->'pages'))
    )
    AND NOT (
      c.targeting_rules->'excludePages' != '[]'::jsonb
      AND p_page_url = ANY(SELECT jsonb_array_elements_text(c.targeting_rules->'excludePages'))
    )
  ORDER BY c.priority DESC, c.created_at DESC;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================

-- Allow authenticated users to read templates
GRANT SELECT ON marketing_templates TO authenticated;

-- Allow authenticated users to read active campaigns
GRANT SELECT ON marketing_campaigns TO authenticated;

-- Allow everyone to insert events
GRANT INSERT ON marketing_campaign_events TO authenticated, anon;

-- Allow users to manage preferences
GRANT SELECT, INSERT, UPDATE ON user_marketing_preferences TO authenticated;

-- ============================================
-- FINAL SETUP
-- ============================================

-- Create trigger to auto-update updated_at on templates
CREATE OR REPLACE FUNCTION update_marketing_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketing_templates_updated_at_trigger
BEFORE UPDATE ON marketing_templates
FOR EACH ROW
EXECUTE FUNCTION update_marketing_templates_updated_at();

-- Create trigger to auto-update updated_at on campaigns
CREATE OR REPLACE FUNCTION update_marketing_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketing_campaigns_updated_at_trigger
BEFORE UPDATE ON marketing_campaigns
FOR EACH ROW
EXECUTE FUNCTION update_marketing_campaigns_updated_at();

-- Create trigger to auto-update updated_at on preferences
CREATE OR REPLACE FUNCTION update_marketing_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketing_preferences_updated_at_trigger
BEFORE UPDATE ON user_marketing_preferences
FOR EACH ROW
EXECUTE FUNCTION update_marketing_preferences_updated_at();
