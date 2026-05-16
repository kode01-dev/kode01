-- Migration: Persistent multi-vendor carts with server-side ownership + purchase linkage
-- Adds carts/cart_items, RLS, cart touch triggers, and purchase linkage for cart-item idempotency.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'checkout_in_progress', 'abandoned_notified', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  variant_key TEXT GENERATED ALWAYS AS (COALESCE(variant_id::text, '__no_variant__')) STORED,
  price_snapshot NUMERIC(10, 2) NOT NULL CHECK (price_snapshot >= 0),
  added_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cart_items
  ADD COLUMN IF NOT EXISTS variant_key TEXT GENERATED ALWAYS AS (COALESCE(variant_id::text, '__no_variant__')) STORED;

CREATE INDEX IF NOT EXISTS idx_carts_user_id ON public.carts(user_id);
CREATE INDEX IF NOT EXISTS idx_carts_status_updated_at ON public.carts(status, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_one_open_per_user
  ON public.carts(user_id)
  WHERE status IN ('active', 'checkout_in_progress', 'abandoned_notified');

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON public.cart_items(product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_variant_id ON public.cart_items(variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product_variant_unique
  ON public.cart_items(cart_id, product_id, variant_key);

ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can select own carts" ON public.carts;
CREATE POLICY "Users can select own carts"
  ON public.carts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own carts" ON public.carts;
CREATE POLICY "Users can insert own carts"
  ON public.carts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own carts" ON public.carts;
CREATE POLICY "Users can update own carts"
  ON public.carts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own carts" ON public.carts;
CREATE POLICY "Users can delete own carts"
  ON public.carts FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can select own cart items" ON public.cart_items;
CREATE POLICY "Users can select own cart items"
  ON public.cart_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own cart items" ON public.cart_items;
CREATE POLICY "Users can insert own cart items"
  ON public.cart_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can update own cart items" ON public.cart_items;
CREATE POLICY "Users can update own cart items"
  ON public.cart_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own cart items" ON public.cart_items;
CREATE POLICY "Users can delete own cart items"
  ON public.cart_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND c.user_id = auth.uid()
    )
  );

DROP TRIGGER IF EXISTS carts_updated_at ON public.carts;
CREATE TRIGGER carts_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.touch_cart_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_cart_id UUID;
BEGIN
  target_cart_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.cart_id
    ELSE NEW.cart_id
  END;

  UPDATE public.carts
  SET updated_at = now()
  WHERE id = target_cart_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_cart_updated_at_on_cart_items ON public.cart_items;
CREATE TRIGGER trg_touch_cart_updated_at_on_cart_items
  AFTER INSERT OR UPDATE OR DELETE ON public.cart_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_cart_updated_at();

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS cart_id UUID REFERENCES public.carts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cart_item_id UUID REFERENCES public.cart_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_cart_id ON public.purchases(cart_id);
CREATE INDEX IF NOT EXISTS idx_purchases_variant_id ON public.purchases(variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_cart_item_unique
  ON public.purchases(cart_item_id)
  WHERE cart_item_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.purchases'::regclass
      AND conname = 'purchases_stripe_payment_intent_id_key'
  ) THEN
    ALTER TABLE public.purchases
      DROP CONSTRAINT purchases_stripe_payment_intent_id_key;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.purchases'::regclass
      AND conname = 'purchases_stripe_checkout_session_id_key'
  ) THEN
    ALTER TABLE public.purchases
      DROP CONSTRAINT purchases_stripe_checkout_session_id_key;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_stripe_payment_intent_single_unique
  ON public.purchases(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL
    AND cart_item_id IS NULL
    AND is_bundle_derived = false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_stripe_checkout_session_single_unique
  ON public.purchases(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL
    AND cart_item_id IS NULL
    AND is_bundle_derived = false;

CREATE INDEX IF NOT EXISTS idx_purchases_stripe_payment_intent_lookup
  ON public.purchases(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_stripe_checkout_session_lookup
  ON public.purchases(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
