-- Migration: Add affiliate columns to purchases
-- SOC 2: RLS enforced, search_path hardened

SET search_path = '';

ALTER TABLE public.purchases 
ADD COLUMN affiliate_id UUID REFERENCES public.profiles(id) DEFAULT NULL,
ADD COLUMN affiliate_commission NUMERIC(10,2) DEFAULT 0 CHECK (affiliate_commission >= 0);

ALTER TABLE public.products
ADD COLUMN generates_license_key BOOLEAN NOT NULL DEFAULT false;

-- Update RLS policies so affiliates can view purchases linked to them
CREATE POLICY "Affiliates can view purchases they referred"
  ON public.purchases FOR SELECT
  USING (auth.uid() = affiliate_id);
