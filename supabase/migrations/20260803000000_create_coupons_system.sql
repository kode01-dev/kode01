-- Migration: Create coupons and coupon redemptions for marketplace checkout discounts
-- Includes RLS policies for sellers/admins and an atomic redemption RPC for webhook usage.

SET search_path = '';

CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  vendor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('percentage', 'fixed')),
  value NUMERIC(10,2) NOT NULL CHECK (value > 0),
  min_order_amount NUMERIC(10,2) CHECK (min_order_amount >= 0),
  max_uses INTEGER CHECK (max_uses > 0),
  current_uses INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  product_ids JSONB,
  stripe_coupon_id TEXT,
  stripe_promotion_code_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupons_valid_window_check CHECK (
    valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from
  ),
  CONSTRAINT coupons_product_ids_array_check CHECK (
    product_ids IS NULL OR jsonb_typeof(product_ids) = 'array'
  )
);

CREATE UNIQUE INDEX idx_coupons_code_ci_unique ON public.coupons ((lower(code)));
CREATE INDEX idx_coupons_vendor_id ON public.coupons(vendor_id);
CREATE INDEX idx_coupons_active_dates ON public.coupons(is_active, valid_from, valid_until);
CREATE INDEX idx_coupons_current_uses ON public.coupons(current_uses);

CREATE TABLE public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  amount_saved NUMERIC(10,2) NOT NULL CHECK (amount_saved >= 0),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coupon_redemptions_coupon_user_unique UNIQUE (coupon_id, user_id),
  CONSTRAINT coupon_redemptions_purchase_unique UNIQUE (purchase_id)
);

CREATE INDEX idx_coupon_redemptions_coupon_id ON public.coupon_redemptions(coupon_id);
CREATE INDEX idx_coupon_redemptions_user_id ON public.coupon_redemptions(user_id);
CREATE INDEX idx_coupon_redemptions_redeemed_at ON public.coupon_redemptions(redeemed_at DESC);

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view own coupons"
  ON public.coupons FOR SELECT
  USING (vendor_id = auth.uid());

CREATE POLICY "Sellers can insert own coupons"
  ON public.coupons FOR INSERT
  WITH CHECK (vendor_id = auth.uid());

CREATE POLICY "Sellers can update own coupons"
  ON public.coupons FOR UPDATE
  USING (vendor_id = auth.uid())
  WITH CHECK (vendor_id = auth.uid());

CREATE POLICY "Sellers can delete own coupons"
  ON public.coupons FOR DELETE
  USING (vendor_id = auth.uid());

CREATE POLICY "Admins can view all coupons"
  ON public.coupons FOR SELECT
  USING (public.current_user_is_admin());

CREATE POLICY "Sellers can view own coupon redemptions"
  ON public.coupon_redemptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.coupons c
      WHERE c.id = coupon_redemptions.coupon_id
        AND c.vendor_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all coupon redemptions"
  ON public.coupon_redemptions FOR SELECT
  USING (public.current_user_is_admin());

DROP TRIGGER IF EXISTS coupons_updated_at ON public.coupons;
CREATE TRIGGER coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.redeem_coupon_usage(
  p_coupon_id UUID,
  p_user_id UUID,
  p_purchase_id UUID,
  p_amount_saved NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_coupon public.coupons%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_inserted INTEGER := 0;
  v_amount_saved NUMERIC(10,2) := GREATEST(COALESCE(p_amount_saved, 0), 0);
BEGIN
  SELECT *
  INTO v_coupon
  FROM public.coupons
  WHERE id = p_coupon_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_coupon.is_active IS NOT TRUE THEN
    RETURN FALSE;
  END IF;

  IF v_coupon.valid_from IS NOT NULL AND v_coupon.valid_from > v_now THEN
    RETURN FALSE;
  END IF;

  IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < v_now THEN
    RETURN FALSE;
  END IF;

  IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.coupon_redemptions (
    coupon_id,
    user_id,
    purchase_id,
    amount_saved
  )
  VALUES (
    p_coupon_id,
    p_user_id,
    p_purchase_id,
    v_amount_saved
  )
  ON CONFLICT (coupon_id, user_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.coupons
  SET current_uses = current_uses + 1,
      updated_at = now()
  WHERE id = p_coupon_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_coupon_usage(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_coupon_usage(UUID, UUID, UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_coupon_usage(UUID, UUID, UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_usage(UUID, UUID, UUID, NUMERIC) TO service_role;
