-- Migration: Create purchases table
-- SOC 2: RLS enforced, search_path hardened

SET search_path = '';

CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT UNIQUE,
  amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  commission_kode01 NUMERIC(10,2) NOT NULL DEFAULT 0,
  seller_payout NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_purchases_buyer_id ON public.purchases(buyer_id);
CREATE INDEX idx_purchases_product_id ON public.purchases(product_id);
CREATE INDEX idx_purchases_seller_id ON public.purchases(seller_id);

-- Enable RLS
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

-- Buyers can view their own purchases
CREATE POLICY "Buyers can view own purchases"
  ON public.purchases FOR SELECT
  USING (auth.uid() = buyer_id);

-- Sellers can view purchases of their products
CREATE POLICY "Sellers can view sales of own products"
  ON public.purchases FOR SELECT
  USING (auth.uid() = seller_id);

-- Only server (service_role) can insert purchases (via Edge Function webhook)
-- No INSERT policy for regular users = secure by default
