-- Migration: Add product_views table for analytics
-- SOC 2: RLS enforced, search_path hardened

SET search_path = '';

CREATE TABLE public.product_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    view_date DATE NOT NULL DEFAULT CURRENT_DATE,
    count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(product_id, view_date)
);

CREATE INDEX idx_product_views_product_id ON public.product_views(product_id);
CREATE INDEX idx_product_views_view_date ON public.product_views(view_date);

ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a view (anonymous) but usually handled by server
-- Sellers can view stats of their own products
CREATE POLICY "Sellers can view own product views"
    ON public.product_views FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.products WHERE id = product_views.product_id AND seller_id = auth.uid()));

-- Server roles can insert or upsert views
