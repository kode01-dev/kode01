-- Migration: Billing foundation for Stripe sync integration
-- Adds Stripe customer mapping + entitlement table used by subscription features.

SET search_path = '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id_unique
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.billing_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'stripe' CHECK (source IN ('stripe', 'admin', 'system')),
  feature_key TEXT NOT NULL,
  feature_value TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_entitlements_user_id
  ON public.billing_entitlements(user_id);

CREATE INDEX IF NOT EXISTS idx_billing_entitlements_active
  ON public.billing_entitlements(is_active, ends_at);

CREATE INDEX IF NOT EXISTS idx_billing_entitlements_feature_key
  ON public.billing_entitlements(feature_key);

CREATE INDEX IF NOT EXISTS idx_billing_entitlements_stripe_subscription_id
  ON public.billing_entitlements(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_billing_entitlements_stripe_customer_id
  ON public.billing_entitlements(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_entitlements_unique_subscription_feature
  ON public.billing_entitlements(user_id, source, feature_key, stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.billing_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own billing entitlements" ON public.billing_entitlements;
CREATE POLICY "Users can view own billing entitlements"
  ON public.billing_entitlements FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view billing entitlements" ON public.billing_entitlements;
CREATE POLICY "Admins can view billing entitlements"
  ON public.billing_entitlements FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
      AND pr.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS billing_entitlements_updated_at ON public.billing_entitlements;
CREATE TRIGGER billing_entitlements_updated_at
  BEFORE UPDATE ON public.billing_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE VIEW public.active_billing_entitlements AS
SELECT
  be.user_id,
  be.feature_key,
  be.feature_value,
  be.source,
  be.stripe_subscription_id,
  be.stripe_price_id,
  be.starts_at,
  be.ends_at,
  be.metadata
FROM public.billing_entitlements be
WHERE be.is_active IS TRUE
  AND (be.ends_at IS NULL OR be.ends_at > now());

CREATE OR REPLACE VIEW public.seller_revenue_summary AS
SELECT
  p.seller_id,
  COUNT(*)::BIGINT AS sales_count,
  COALESCE(SUM(p.amount), 0)::NUMERIC(12,2) AS gross_amount,
  COALESCE(SUM(p.commission_kode01), 0)::NUMERIC(12,2) AS platform_commission_amount,
  COALESCE(SUM(p.affiliate_commission), 0)::NUMERIC(12,2) AS affiliate_commission_amount,
  COALESCE(SUM(p.seller_payout), 0)::NUMERIC(12,2) AS seller_net_amount
FROM public.purchases p
WHERE p.status = 'completed'
GROUP BY p.seller_id;

