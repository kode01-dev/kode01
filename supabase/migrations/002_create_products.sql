-- Migration: Create products table
-- SOC 2: RLS enforced, search_path hardened

SET search_path = '';

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  file_path_vault TEXT,
  cover_image_url TEXT,
  category TEXT,
  tags TEXT[] DEFAULT '{}',
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_products_seller_id ON public.products(seller_id);
CREATE INDEX idx_products_status ON public.products(status);
CREATE INDEX idx_products_slug ON public.products(slug);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Anyone can view published products (marketplace)
CREATE POLICY "Published products are viewable by everyone"
  ON public.products FOR SELECT
  USING (status = 'published');

-- Sellers can view all their own products (including drafts)
CREATE POLICY "Sellers can view own products"
  ON public.products FOR SELECT
  USING (auth.uid() = seller_id);

-- Sellers can insert their own products
CREATE POLICY "Sellers can insert own products"
  ON public.products FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- Sellers can update their own products
CREATE POLICY "Sellers can update own products"
  ON public.products FOR UPDATE
  USING (auth.uid() = seller_id)
  WITH CHECK (auth.uid() = seller_id);

-- Sellers can delete their own products
CREATE POLICY "Sellers can delete own products"
  ON public.products FOR DELETE
  USING (auth.uid() = seller_id);

-- Reuse updated_at trigger
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
