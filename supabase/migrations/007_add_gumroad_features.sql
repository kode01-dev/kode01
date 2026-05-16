-- Migration: Add Gumroad-inspired features
-- Covers: PWYW (Pay What You Want), Product Variants, License Keys, Affiliates, Scheduled Emails
-- SOC 2: RLS enforced, search_path hardened

SET search_path = '';

-- 1. Update products table for Pay What You Want (PWYW)
ALTER TABLE public.products
ADD COLUMN is_pwyw BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN min_price NUMERIC(10,2) DEFAULT 0 CHECK (min_price >= 0);

-- 2. Create product_variants table
CREATE TABLE public.product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    price_override NUMERIC(10,2) DEFAULT NULL CHECK (price_override IS NULL OR price_override >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_variants_product_id ON public.product_variants(product_id);
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Published product variants are viewable by everyone"
    ON public.product_variants FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.products WHERE id = product_variants.product_id AND status = 'published'));

CREATE POLICY "Sellers can view own product variants"
    ON public.product_variants FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.products WHERE id = product_variants.product_id AND seller_id = auth.uid()));

CREATE POLICY "Sellers can insert own product variants"
    ON public.product_variants FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE id = product_variants.product_id AND seller_id = auth.uid()));

CREATE POLICY "Sellers can update own product variants"
    ON public.product_variants FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.products WHERE id = product_variants.product_id AND seller_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE id = product_variants.product_id AND seller_id = auth.uid()));

CREATE POLICY "Sellers can delete own product variants"
    ON public.product_variants FOR DELETE
    USING (EXISTS (SELECT 1 FROM public.products WHERE id = product_variants.product_id AND seller_id = auth.uid()));

CREATE TRIGGER product_variants_updated_at
    BEFORE UPDATE ON public.product_variants
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- 3. Create license_keys table
CREATE TABLE public.license_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    key TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    uses_count INTEGER NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
    max_uses INTEGER DEFAULT 1 CHECK (max_uses IS NULL OR max_uses > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_license_keys_purchase_id ON public.license_keys(purchase_id);
CREATE INDEX idx_license_keys_product_id ON public.license_keys(product_id);
CREATE INDEX idx_license_keys_key ON public.license_keys(key);
ALTER TABLE public.license_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers can view own license keys"
    ON public.license_keys FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.purchases WHERE id = license_keys.purchase_id AND buyer_id = auth.uid()));

CREATE POLICY "Sellers can view license keys of their products"
    ON public.license_keys FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.products WHERE id = license_keys.product_id AND seller_id = auth.uid()));

-- Only server (service_role) can insert or update license keys (e.g., via edge functions when purchase is complete)


-- 4. Create affiliates table
CREATE TABLE public.affiliates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
    affiliate_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, product_id)
);

CREATE INDEX idx_affiliates_user_id ON public.affiliates(user_id);
CREATE INDEX idx_affiliates_product_id ON public.affiliates(product_id);
CREATE INDEX idx_affiliates_code ON public.affiliates(affiliate_code);
ALTER TABLE public.affiliates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view affiliates to resolve codes"
    ON public.affiliates FOR SELECT
    USING (true);

CREATE POLICY "Sellers can manage affiliates of their products"
    ON public.affiliates FOR ALL
    USING (EXISTS (SELECT 1 FROM public.products WHERE id = affiliates.product_id AND seller_id = auth.uid()))
    WITH CHECK (EXISTS (SELECT 1 FROM public.products WHERE id = affiliates.product_id AND seller_id = auth.uid()));


-- 5. Create scheduled_emails table for Drip Campaigns
CREATE TABLE public.scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    email_type TEXT NOT NULL,
    send_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_emails_status_send_at ON public.scheduled_emails(status, send_at);
CREATE INDEX idx_scheduled_emails_purchase_id ON public.scheduled_emails(purchase_id);
ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sellers can view scheduled emails for their sales"
    ON public.scheduled_emails FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.purchases p JOIN public.products pr ON p.product_id = pr.id WHERE p.id = scheduled_emails.purchase_id AND pr.seller_id = auth.uid()));

-- Only server (pg_cron / edge functions) can manage scheduled emails insertion and updates.
