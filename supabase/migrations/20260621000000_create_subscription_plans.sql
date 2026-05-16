-- Dynamic Stripe subscription plan catalog.
-- Allows adding/updating plans without redeploying edge functions.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.subscription_plans (
  plan_key TEXT PRIMARY KEY
    CHECK (plan_key ~ '^[a-z0-9][a-z0-9._-]{0,63}$'),
  display_name TEXT,
  stripe_price_id TEXT NOT NULL UNIQUE,
  feature_key TEXT NOT NULL,
  grants_pro_entitlement BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active
  ON public.subscription_plans(is_active);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view subscription plans" ON public.subscription_plans;
CREATE POLICY "Admins can view subscription plans"
  ON public.subscription_plans
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert subscription plans" ON public.subscription_plans;
CREATE POLICY "Admins can insert subscription plans"
  ON public.subscription_plans
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update subscription plans" ON public.subscription_plans;
CREATE POLICY "Admins can update subscription plans"
  ON public.subscription_plans
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete subscription plans" ON public.subscription_plans;
CREATE POLICY "Admins can delete subscription plans"
  ON public.subscription_plans
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
