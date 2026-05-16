-- Public vendor badges: computed by cron, displayed on product + creator pages
-- Persists earned badges per vendor for trust/conversion signals to buyers.

CREATE TYPE public.vendor_badge_type AS ENUM (
  'top_seller',
  'verified',
  'fast_responder',
  '100_sales',
  'rising_star',
  'trusted_quality'
);

CREATE TABLE public.vendor_badges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_type public.vendor_badge_type NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor_id, badge_type)
);

CREATE INDEX idx_vendor_badges_vendor_id ON public.vendor_badges(vendor_id);
CREATE INDEX idx_vendor_badges_badge_type ON public.vendor_badges(badge_type);

ALTER TABLE public.vendor_badges ENABLE ROW LEVEL SECURITY;

-- Public read: badges are meant to be visible to all buyers.
CREATE POLICY "Anyone can view vendor badges"
  ON public.vendor_badges
  FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policies: only the service role (via cron) manages rows.

GRANT SELECT ON public.vendor_badges TO anon, authenticated;
