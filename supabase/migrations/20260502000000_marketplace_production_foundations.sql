-- Marketplace production foundations: canonical product fields, immutable checkout snapshots,
-- order/payment/refund tables, webhook stale-lock support, and aggregate RLS hardening.

SET search_path = '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS file_path_vault TEXT,
  ADD COLUMN IF NOT EXISTS is_pwyw BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_price NUMERIC(10,2);

CREATE INDEX IF NOT EXISTS idx_products_seller_status_created_at
  ON public.products (seller_id, status, created_at DESC);

ALTER TABLE public.recommendation_events
  DROP CONSTRAINT IF EXISTS recommendation_events_event_type_check,
  DROP CONSTRAINT IF EXISTS recommendation_events_source_type_check;

ALTER TABLE public.recommendation_events
  ADD CONSTRAINT recommendation_events_event_type_check
    CHECK (event_type IN (
      'product_view',
      'brain_view',
      'recommendation_click',
      'blog_to_news_click',
      'news_to_blog_click',
      'add_to_cart',
      'checkout_started',
      'checkout_completed',
      'download_started',
      'refund_requested'
    )),
  ADD CONSTRAINT recommendation_events_source_type_check
    CHECK (source_type IN ('product', 'brain', 'blog', 'news', 'cart', 'checkout', 'download', 'refund'));

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_processing_locked_at
  ON public.stripe_webhook_events (locked_at)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS public.checkout_session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id TEXT NOT NULL,
  cart_id UUID,
  cart_item_id UUID,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  application_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (application_fee_cents >= 0),
  seller_payout_cents INTEGER NOT NULL DEFAULT 0 CHECK (seller_payout_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT checkout_session_items_unique_cart_item
    UNIQUE (stripe_checkout_session_id, cart_item_id)
);

CREATE INDEX IF NOT EXISTS idx_checkout_session_items_session
  ON public.checkout_session_items (stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_checkout_session_items_buyer_created
  ON public.checkout_session_items (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_session_items_seller_created
  ON public.checkout_session_items (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checkout_session_items_product_created
  ON public.checkout_session_items (product_id, created_at DESC);

ALTER TABLE public.checkout_session_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can view own checkout snapshots" ON public.checkout_session_items;
CREATE POLICY "Buyers can view own checkout snapshots"
  ON public.checkout_session_items FOR SELECT
  USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Sellers can view own checkout snapshots" ON public.checkout_session_items;
CREATE POLICY "Sellers can view own checkout snapshots"
  ON public.checkout_session_items FOR SELECT
  USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Admins can view checkout snapshots" ON public.checkout_session_items;
CREATE POLICY "Admins can view checkout snapshots"
  ON public.checkout_session_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'partially_refunded', 'refunded', 'failed', 'cancelled')),
  currency TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_created
  ON public.orders (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_payment_intent
  ON public.orders (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can view own orders" ON public.orders;
CREATE POLICY "Buyers can view own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = buyer_id);

DROP POLICY IF EXISTS "Admins can view orders" ON public.orders;
CREATE POLICY "Admins can view orders"
  ON public.orders FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  platform_fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  seller_payout_cents INTEGER NOT NULL DEFAULT 0 CHECK (seller_payout_cents >= 0),
  fulfillment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'fulfilled', 'blocked', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_seller_created
  ON public.order_items (seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_product_created
  ON public.order_items (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_purchase
  ON public.order_items (purchase_id)
  WHERE purchase_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_purchase_unique
  ON public.order_items (purchase_id)
  WHERE purchase_id IS NOT NULL;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can view own order items" ON public.order_items;
CREATE POLICY "Buyers can view own order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.buyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sellers can view own order items" ON public.order_items;
CREATE POLICY "Sellers can view own order items"
  ON public.order_items FOR SELECT
  USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Admins can view order items" ON public.order_items;
CREATE POLICY "Admins can view order items"
  ON public.order_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_payment_intent_id TEXT,
  provider_checkout_session_id TEXT,
  provider_charge_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded', 'disputed')),
  failure_reason TEXT,
  raw_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payments_provider_payment_intent_unique UNIQUE (provider, provider_payment_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_payments_order
  ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_created
  ON public.payments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_checkout_session
  ON public.payments (provider_checkout_session_id)
  WHERE provider_checkout_session_id IS NOT NULL;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can view own payments" ON public.payments;
CREATE POLICY "Buyers can view own payments"
  ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = payments.order_id AND o.buyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view payments" ON public.payments;
CREATE POLICY "Admins can view payments"
  ON public.payments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  reason TEXT,
  stripe_refund_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refunds_order
  ON public.refunds (order_id)
  WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_purchase
  ON public.refunds (purchase_id)
  WHERE purchase_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_refunds_status_created
  ON public.refunds (status, created_at DESC);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can view own refunds" ON public.refunds;
CREATE POLICY "Buyers can view own refunds"
  ON public.refunds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = refunds.order_id AND o.buyer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.id = refunds.purchase_id AND p.buyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Sellers can view own refunds" ON public.refunds;
CREATE POLICY "Sellers can view own refunds"
  ON public.refunds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.id = refunds.order_item_id AND oi.seller_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.purchases p
      WHERE p.id = refunds.purchase_id AND p.seller_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view refunds" ON public.refunds;
CREATE POLICY "Admins can view refunds"
  ON public.refunds FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.seller_daily_analytics (
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  views_count INTEGER NOT NULL DEFAULT 0 CHECK (views_count >= 0),
  sales_count INTEGER NOT NULL DEFAULT 0 CHECK (sales_count >= 0),
  revenue_cents INTEGER NOT NULL DEFAULT 0 CHECK (revenue_cents >= 0),
  refund_cents INTEGER NOT NULL DEFAULT 0 CHECK (refund_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (seller_id, product_id, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_seller_daily_analytics_seller_date
  ON public.seller_daily_analytics (seller_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_seller_daily_analytics_product_date
  ON public.seller_daily_analytics (product_id, metric_date DESC)
  WHERE product_id IS NOT NULL;

ALTER TABLE public.seller_daily_analytics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Sellers can view own daily analytics" ON public.seller_daily_analytics;
CREATE POLICY "Sellers can view own daily analytics"
  ON public.seller_daily_analytics FOR SELECT
  USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS "Admins can view daily analytics" ON public.seller_daily_analytics;
CREATE POLICY "Admins can view daily analytics"
  ON public.seller_daily_analytics FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'admin'
    )
  );

DO $$
BEGIN
  IF to_regclass('public.product_popularity_agg_90d') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.product_popularity_agg_90d ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS "Public can read product popularity aggregate" ON public.product_popularity_agg_90d';
    EXECUTE 'CREATE POLICY "Public can read product popularity aggregate" ON public.product_popularity_agg_90d FOR SELECT USING (true)';
  END IF;
END;
$$;
