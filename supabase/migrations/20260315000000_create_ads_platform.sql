-- Migration: Internal ads platform (web + newsletter)
-- Includes pricing plans, placements, campaigns, creatives, orders, and events.

SET search_path = '';

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

CREATE TABLE IF NOT EXISTS public.ad_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug IN ('free', 'news', 'newsletter_footer')),
  display_name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'email')),
  price_multiplier NUMERIC(6, 3) NOT NULL DEFAULT 1 CHECK (price_multiplier > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_pricing_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  price_usd NUMERIC(10, 2) NOT NULL CHECK (price_usd >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  advertiser_type TEXT NOT NULL CHECK (advertiser_type IN ('user', 'company', 'admin')),
  name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN (
      'draft',
      'pending_payment',
      'pending_review',
      'approved',
      'rejected',
      'active',
      'paused',
      'completed'
    )
  ) DEFAULT 'draft',
  pricing_plan_id UUID REFERENCES public.ad_pricing_plans(id) ON DELETE SET NULL,
  duration_days INTEGER NOT NULL CHECK (duration_days > 0),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  total_price_usd NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_price_usd >= 0),
  is_paid BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_campaign_placements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  placement_id UUID NOT NULL REFERENCES public.ad_placements(id) ON DELETE CASCADE,
  multiplier_snapshot NUMERIC(6, 3) NOT NULL CHECK (multiplier_snapshot > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, placement_id)
);

CREATE TABLE IF NOT EXISTS public.ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  locale TEXT CHECK (locale IN ('fr', 'en')),
  title TEXT NOT NULL,
  cta_text TEXT NOT NULL,
  image_url TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  destination_kind TEXT NOT NULL CHECK (destination_kind IN ('internal', 'external')),
  placement_slug TEXT CHECK (placement_slug IN ('news', 'newsletter_footer')),
  page_count INTEGER NOT NULL DEFAULT 1 CHECK (page_count > 0 AND page_count <= 500),
  validation_status TEXT NOT NULL CHECK (validation_status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  amount_usd NUMERIC(10, 2) NOT NULL CHECK (amount_usd >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'failed', 'refunded')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ad_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  creative_id UUID REFERENCES public.ad_creatives(id) ON DELETE SET NULL,
  placement_id UUID REFERENCES public.ad_placements(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('impression', 'click', 'email_delivered', 'email_ad_click')),
  channel TEXT NOT NULL CHECK (channel IN ('web', 'email')),
  page_path TEXT,
  locale TEXT,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  fingerprint TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_owner ON public.ad_campaigns(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON public.ad_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign ON public.ad_creatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_placement ON public.ad_creatives(campaign_id, placement_slug);
CREATE INDEX IF NOT EXISTS idx_ad_orders_campaign ON public.ad_orders(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_orders_owner ON public.ad_orders(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ad_events_campaign ON public.ad_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_events_created_at ON public.ad_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_events_type_channel ON public.ad_events(event_type, channel);

ALTER TABLE public.ad_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_pricing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_campaign_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ad placements are publicly readable" ON public.ad_placements;
CREATE POLICY "Ad placements are publicly readable"
  ON public.ad_placements FOR SELECT
  USING (is_active = true OR public.is_admin_user());

DROP POLICY IF EXISTS "Ad placements admin write" ON public.ad_placements;
CREATE POLICY "Ad placements admin write"
  ON public.ad_placements FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Ad pricing plans are publicly readable" ON public.ad_pricing_plans;
CREATE POLICY "Ad pricing plans are publicly readable"
  ON public.ad_pricing_plans FOR SELECT
  USING (is_active = true OR public.is_admin_user());

DROP POLICY IF EXISTS "Ad pricing plans admin write" ON public.ad_pricing_plans;
CREATE POLICY "Ad pricing plans admin write"
  ON public.ad_pricing_plans FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "Ad campaign owners can read their campaigns" ON public.ad_campaigns;
CREATE POLICY "Ad campaign owners can read their campaigns"
  ON public.ad_campaigns FOR SELECT
  USING (owner_user_id = auth.uid() OR public.is_admin_user());

DROP POLICY IF EXISTS "Ad campaign owners can insert campaigns" ON public.ad_campaigns;
CREATE POLICY "Ad campaign owners can insert campaigns"
  ON public.ad_campaigns FOR INSERT
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin_user());

DROP POLICY IF EXISTS "Ad campaign owners can update draft campaigns" ON public.ad_campaigns;
CREATE POLICY "Ad campaign owners can update draft campaigns"
  ON public.ad_campaigns FOR UPDATE
  USING (owner_user_id = auth.uid() OR public.is_admin_user())
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin_user());

DROP POLICY IF EXISTS "Ad campaign placements owner read write" ON public.ad_campaign_placements;
CREATE POLICY "Ad campaign placements owner read write"
  ON public.ad_campaign_placements FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.ad_campaigns c
      WHERE c.id = campaign_id
        AND (c.owner_user_id = auth.uid() OR public.is_admin_user())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ad_campaigns c
      WHERE c.id = campaign_id
        AND (c.owner_user_id = auth.uid() OR public.is_admin_user())
    )
  );

DROP POLICY IF EXISTS "Ad creatives owner read write" ON public.ad_creatives;
CREATE POLICY "Ad creatives owner read write"
  ON public.ad_creatives FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.ad_campaigns c
      WHERE c.id = campaign_id
        AND (c.owner_user_id = auth.uid() OR public.is_admin_user())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.ad_campaigns c
      WHERE c.id = campaign_id
        AND (c.owner_user_id = auth.uid() OR public.is_admin_user())
    )
  );

DROP POLICY IF EXISTS "Ad orders owner read" ON public.ad_orders;
CREATE POLICY "Ad orders owner read"
  ON public.ad_orders FOR SELECT
  USING (owner_user_id = auth.uid() OR public.is_admin_user());

DROP POLICY IF EXISTS "Ad orders owner insert" ON public.ad_orders;
CREATE POLICY "Ad orders owner insert"
  ON public.ad_orders FOR INSERT
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin_user());

DROP POLICY IF EXISTS "Ad orders owner update" ON public.ad_orders;
CREATE POLICY "Ad orders owner update"
  ON public.ad_orders FOR UPDATE
  USING (owner_user_id = auth.uid() OR public.is_admin_user())
  WITH CHECK (owner_user_id = auth.uid() OR public.is_admin_user());

DROP POLICY IF EXISTS "Ad events owners and admin read" ON public.ad_events;
CREATE POLICY "Ad events owners and admin read"
  ON public.ad_events FOR SELECT
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM public.ad_campaigns c
      WHERE c.id = campaign_id
        AND c.owner_user_id = auth.uid()
    )
  );

CREATE TRIGGER ad_placements_updated_at
  BEFORE UPDATE ON public.ad_placements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ad_pricing_plans_updated_at
  BEFORE UPDATE ON public.ad_pricing_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ad_campaigns_updated_at
  BEFORE UPDATE ON public.ad_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ad_creatives_updated_at
  BEFORE UPDATE ON public.ad_creatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER ad_orders_updated_at
  BEFORE UPDATE ON public.ad_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ad_placements (slug, display_name, channel, price_multiplier, is_active)
VALUES
  ('free', 'Free Content', 'web', 1.000, true),
  ('news', 'News Pages', 'web', 1.500, true),
  ('newsletter_footer', 'Newsletter Footer', 'email', 1.750, true)
ON CONFLICT (slug) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  channel = EXCLUDED.channel,
  price_multiplier = EXCLUDED.price_multiplier,
  is_active = EXCLUDED.is_active;

INSERT INTO public.ad_pricing_plans (code, name, duration_days, price_usd, is_active)
VALUES
  ('ads_7d', '7 days', 7, 49.00, true),
  ('ads_30d', '30 days', 30, 149.00, true)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  duration_days = EXCLUDED.duration_days,
  price_usd = EXCLUDED.price_usd,
  is_active = EXCLUDED.is_active;
