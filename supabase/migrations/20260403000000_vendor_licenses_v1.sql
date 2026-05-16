-- Migration: Vendor license integration v1 (toggle + verify/activate + outbound webhook reliability)
-- Includes corrective profile columns for environments where Connect migration was not applied.

SET search_path = '';

-- ---------------------------------------------------------------------------
-- Corrective profile columns (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_completed_at TIMESTAMPTZ;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_slug
  ON public.profiles(slug);

-- ---------------------------------------------------------------------------
-- Vendor integration settings used by license verify/activate/webhook flows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendor_license_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  webhook_url TEXT,
  api_secret TEXT,
  webhook_secret TEXT,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id)
);

CREATE INDEX IF NOT EXISTS idx_vendor_license_integrations_enabled
  ON public.vendor_license_integrations(enabled);

ALTER TABLE public.vendor_license_integrations
  ADD COLUMN IF NOT EXISTS api_secret TEXT;

ALTER TABLE public.vendor_license_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own license integration" ON public.vendor_license_integrations;
CREATE POLICY "Sellers can view own license integration"
  ON public.vendor_license_integrations FOR SELECT
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Sellers can insert own license integration" ON public.vendor_license_integrations;
CREATE POLICY "Sellers can insert own license integration"
  ON public.vendor_license_integrations FOR INSERT
  WITH CHECK (
    seller_id = auth.uid()
    AND (
      enabled IS FALSE
      OR (
        webhook_url IS NOT NULL
        AND webhook_url <> ''
        AND webhook_secret IS NOT NULL
        AND webhook_secret <> ''
        AND api_secret IS NOT NULL
        AND api_secret <> ''
      )
    )
  );

DROP POLICY IF EXISTS "Sellers can update own license integration" ON public.vendor_license_integrations;
CREATE POLICY "Sellers can update own license integration"
  ON public.vendor_license_integrations FOR UPDATE
  USING (seller_id = auth.uid())
  WITH CHECK (
    seller_id = auth.uid()
    AND (
      enabled IS FALSE
      OR (
        webhook_url IS NOT NULL
        AND webhook_url <> ''
        AND webhook_secret IS NOT NULL
        AND webhook_secret <> ''
        AND api_secret IS NOT NULL
        AND api_secret <> ''
      )
    )
  );

DROP POLICY IF EXISTS "Admins can view all license integrations" ON public.vendor_license_integrations;
CREATE POLICY "Admins can view all license integrations"
  ON public.vendor_license_integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS vendor_license_integrations_updated_at ON public.vendor_license_integrations;
CREATE TRIGGER vendor_license_integrations_updated_at
  BEFORE UPDATE ON public.vendor_license_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- License activation logs (idempotency + audit)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.license_activation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  license_key_id UUID REFERENCES public.license_keys(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  vendor_user_id TEXT,
  external_user_ref TEXT,
  status TEXT NOT NULL CHECK (status IN ('processing', 'activated', 'rejected', 'replayed')),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (seller_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_license_activation_events_seller_created
  ON public.license_activation_events(seller_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_license_activation_events_license_key_id
  ON public.license_activation_events(license_key_id);

ALTER TABLE public.license_activation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own license activation events" ON public.license_activation_events;
CREATE POLICY "Sellers can view own license activation events"
  ON public.license_activation_events FOR SELECT
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all license activation events" ON public.license_activation_events;
CREATE POLICY "Admins can view all license activation events"
  ON public.license_activation_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Outbound webhook queue for vendor apps (retries + delivery logs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.license_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL DEFAULT 'license.issued',
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  license_key_id UUID REFERENCES public.license_keys(id) ON DELETE SET NULL,
  endpoint_url TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  signature TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'sent', 'failed', 'cancelled')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 6 CHECK (max_attempts > 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_response_status INTEGER,
  last_response_body TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_license_webhook_deliveries_retry
  ON public.license_webhook_deliveries(status, next_attempt_at);

CREATE INDEX IF NOT EXISTS idx_license_webhook_deliveries_seller_created
  ON public.license_webhook_deliveries(seller_id, created_at DESC);

ALTER TABLE public.license_webhook_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own license webhook deliveries" ON public.license_webhook_deliveries;
CREATE POLICY "Sellers can view own license webhook deliveries"
  ON public.license_webhook_deliveries FOR SELECT
  USING (seller_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all license webhook deliveries" ON public.license_webhook_deliveries;
CREATE POLICY "Admins can view all license webhook deliveries"
  ON public.license_webhook_deliveries FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS license_webhook_deliveries_updated_at ON public.license_webhook_deliveries;
CREATE TRIGGER license_webhook_deliveries_updated_at
  BEFORE UPDATE ON public.license_webhook_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Atomic idempotent activation RPC used by /api/licenses/activate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activate_license_key_v1(
  p_license_key TEXT,
  p_product_id UUID,
  p_seller_id UUID,
  p_vendor_user_id TEXT,
  p_external_user_ref TEXT,
  p_idempotency_key TEXT
)
RETURNS TABLE (
  activation_status TEXT,
  reason TEXT,
  license_key_id UUID,
  purchase_id UUID,
  product_id UUID,
  seller_id UUID,
  uses_count INTEGER,
  max_uses INTEGER,
  key_status TEXT,
  replayed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_event_id UUID;
  v_existing_event public.license_activation_events%ROWTYPE;
  v_license public.license_keys%ROWTYPE;
  v_purchase public.purchases%ROWTYPE;
  v_new_uses_count INTEGER;
BEGIN
  IF p_license_key IS NULL OR btrim(p_license_key) = '' THEN
    RAISE EXCEPTION 'license key is required';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;

  BEGIN
    INSERT INTO public.license_activation_events (
      seller_id,
      product_id,
      idempotency_key,
      vendor_user_id,
      external_user_ref,
      status,
      metadata
    ) VALUES (
      p_seller_id,
      p_product_id,
      p_idempotency_key,
      p_vendor_user_id,
      p_external_user_ref,
      'processing',
      jsonb_build_object('source', 'api')
    )
    RETURNING id INTO v_event_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT *
      INTO v_existing_event
      FROM public.license_activation_events
      WHERE seller_id = p_seller_id
        AND idempotency_key = p_idempotency_key
      LIMIT 1;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'idempotency lock conflict without persisted event';
      END IF;

      SELECT *
      INTO v_license
      FROM public.license_keys lk
      WHERE lk.id = v_existing_event.license_key_id;

      RETURN QUERY
      SELECT
        CASE WHEN v_existing_event.status = 'activated' THEN 'replayed' ELSE v_existing_event.status END,
        v_existing_event.reason,
        v_existing_event.license_key_id,
        v_existing_event.purchase_id,
        v_existing_event.product_id,
        v_existing_event.seller_id,
        COALESCE(v_license.uses_count, 0),
        v_license.max_uses,
        COALESCE(v_license.status, 'unknown'),
        true;
      RETURN;
  END;

  SELECT lk.*
  INTO v_license
  FROM public.license_keys lk
  WHERE lk.key = p_license_key
    AND lk.product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.license_activation_events
    SET status = 'rejected', reason = 'license_not_found'
    WHERE id = v_event_id;

    RETURN QUERY SELECT 'rejected', 'license_not_found', NULL::UUID, NULL::UUID, p_product_id, p_seller_id, 0, NULL::INTEGER, 'unknown', false;
    RETURN;
  END IF;

  SELECT p.*
  INTO v_purchase
  FROM public.purchases p
  WHERE p.id = v_license.purchase_id;

  IF v_purchase.seller_id IS DISTINCT FROM p_seller_id THEN
    UPDATE public.license_activation_events
    SET
      status = 'rejected',
      reason = 'seller_mismatch',
      license_key_id = v_license.id,
      purchase_id = v_license.purchase_id,
      product_id = v_license.product_id
    WHERE id = v_event_id;

    RETURN QUERY SELECT 'rejected', 'seller_mismatch', v_license.id, v_license.purchase_id, v_license.product_id, p_seller_id, v_license.uses_count, v_license.max_uses, v_license.status, false;
    RETURN;
  END IF;

  IF v_purchase.status <> 'completed' THEN
    UPDATE public.license_activation_events
    SET
      status = 'rejected',
      reason = 'purchase_not_completed',
      license_key_id = v_license.id,
      purchase_id = v_license.purchase_id,
      product_id = v_license.product_id
    WHERE id = v_event_id;

    RETURN QUERY SELECT 'rejected', 'purchase_not_completed', v_license.id, v_license.purchase_id, v_license.product_id, p_seller_id, v_license.uses_count, v_license.max_uses, v_license.status, false;
    RETURN;
  END IF;

  IF v_license.status <> 'active' THEN
    UPDATE public.license_activation_events
    SET
      status = 'rejected',
      reason = 'license_not_active',
      license_key_id = v_license.id,
      purchase_id = v_license.purchase_id,
      product_id = v_license.product_id
    WHERE id = v_event_id;

    RETURN QUERY SELECT 'rejected', 'license_not_active', v_license.id, v_license.purchase_id, v_license.product_id, p_seller_id, v_license.uses_count, v_license.max_uses, v_license.status, false;
    RETURN;
  END IF;

  IF v_license.max_uses IS NOT NULL AND v_license.uses_count >= v_license.max_uses THEN
    UPDATE public.license_activation_events
    SET
      status = 'rejected',
      reason = 'max_uses_exceeded',
      license_key_id = v_license.id,
      purchase_id = v_license.purchase_id,
      product_id = v_license.product_id
    WHERE id = v_event_id;

    RETURN QUERY SELECT 'rejected', 'max_uses_exceeded', v_license.id, v_license.purchase_id, v_license.product_id, p_seller_id, v_license.uses_count, v_license.max_uses, v_license.status, false;
    RETURN;
  END IF;

  UPDATE public.license_keys
  SET uses_count = uses_count + 1
  WHERE id = v_license.id
  RETURNING uses_count INTO v_new_uses_count;

  UPDATE public.license_activation_events
  SET
    status = 'activated',
    reason = NULL,
    license_key_id = v_license.id,
    purchase_id = v_license.purchase_id,
    product_id = v_license.product_id
  WHERE id = v_event_id;

  RETURN QUERY
  SELECT
    'activated',
    NULL::TEXT,
    v_license.id,
    v_license.purchase_id,
    v_license.product_id,
    p_seller_id,
    v_new_uses_count,
    v_license.max_uses,
    v_license.status,
    false;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_license_key_v1(
  TEXT,
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.activate_license_key_v1(
  TEXT,
  UUID,
  UUID,
  TEXT,
  TEXT,
  TEXT
) TO service_role;
