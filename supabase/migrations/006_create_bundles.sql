-- Migration: Create bundles concept
-- SOC 2: RLS enforced, search_path hardened
-- Displa Standards: All functions and views clearly name spaced

SET search_path = '';

-- Add is_bundle flag to products table to distinguish them from standard products
ALTER TABLE public.products ADD COLUMN is_bundle BOOLEAN NOT NULL DEFAULT false;

-- Create junction table to define which products belong to which bundle
CREATE TABLE public.product_bundle_items (
  bundle_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (bundle_id, product_id)
);

-- Index for fast lookup of bundle contents
CREATE INDEX idx_product_bundle_items_bundle_id ON public.product_bundle_items(bundle_id);
-- Index for fast lookup of which bundles a product belongs to
CREATE INDEX idx_product_bundle_items_product_id ON public.product_bundle_items(product_id);

-- Enable RLS
ALTER TABLE public.product_bundle_items ENABLE ROW LEVEL SECURITY;

-- Anyone can view bundle items if the bundle is published
CREATE POLICY "Bundle items are viewable if bundle is published"
  ON public.product_bundle_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_bundle_items.bundle_id
      AND p.status = 'published'
    )
  );

-- Sellers can manage bundle items for bundles they own
-- We use EXISTS query on the products table to check ownership of the bundle
CREATE POLICY "Sellers can view own bundle items"
  ON public.product_bundle_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_bundle_items.bundle_id
      AND p.seller_id = auth.uid()
    )
  );

CREATE POLICY "Sellers can manage own bundle items"
  ON public.product_bundle_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_bundle_items.bundle_id
      AND p.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_bundle_items.bundle_id
      AND p.seller_id = auth.uid()
    )
  );
