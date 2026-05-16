-- Migration: Harden profile privilege fields against client-side escalation.
-- SOC 2: untrusted clients cannot create or mutate admin/sensitive profile state.

SET search_path = '';

CREATE OR REPLACE FUNCTION public.profile_sensitive_fields_unchanged(
  p_role TEXT,
  p_plan_type TEXT,
  p_stripe_account_id TEXT,
  p_stripe_customer_id TEXT,
  p_stripe_charges_enabled BOOLEAN,
  p_stripe_payouts_enabled BOOLEAN,
  p_stripe_details_submitted BOOLEAN,
  p_stripe_onboarding_completed_at TIMESTAMPTZ,
  p_is_verified BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS existing
    WHERE existing.id = auth.uid()
      AND existing.role IS NOT DISTINCT FROM p_role
      AND existing.plan_type IS NOT DISTINCT FROM p_plan_type
      AND existing.stripe_account_id IS NOT DISTINCT FROM p_stripe_account_id
      AND existing.stripe_customer_id IS NOT DISTINCT FROM p_stripe_customer_id
      AND existing.stripe_charges_enabled IS NOT DISTINCT FROM p_stripe_charges_enabled
      AND existing.stripe_payouts_enabled IS NOT DISTINCT FROM p_stripe_payouts_enabled
      AND existing.stripe_details_submitted IS NOT DISTINCT FROM p_stripe_details_submitted
      AND existing.stripe_onboarding_completed_at IS NOT DISTINCT FROM p_stripe_onboarding_completed_at
      AND existing.is_verified IS NOT DISTINCT FROM p_is_verified
  );
$$;

COMMENT ON FUNCTION public.profile_sensitive_fields_unchanged(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN,
  TIMESTAMPTZ,
  BOOLEAN
) IS 'RLS helper that allows profile self-updates only when privilege, billing, Connect, and verification fields are unchanged.';

REVOKE ALL ON FUNCTION public.profile_sensitive_fields_unchanged(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN,
  TIMESTAMPTZ,
  BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.profile_sensitive_fields_unchanged(
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN,
  TIMESTAMPTZ,
  BOOLEAN
) TO authenticated;

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (
    auth.uid() = id
    AND role = 'buyer'
    AND plan_type = 'free'
    AND stripe_account_id IS NULL
    AND stripe_customer_id IS NULL
    AND stripe_charges_enabled IS FALSE
    AND stripe_payouts_enabled IS FALSE
    AND stripe_details_submitted IS FALSE
    AND stripe_onboarding_completed_at IS NULL
    AND is_verified IS FALSE
  );

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND public.profile_sensitive_fields_unchanged(
      role,
      plan_type,
      stripe_account_id,
      stripe_customer_id,
      stripe_charges_enabled,
      stripe_payouts_enabled,
      stripe_details_submitted,
      stripe_onboarding_completed_at,
      is_verified
    )
  );
