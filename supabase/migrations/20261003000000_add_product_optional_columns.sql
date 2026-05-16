-- Migration: Add product optional columns
-- SOC 2: RLS enforced, search_path hardened
SET search_path = '';

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS original_price NUMERIC(10,2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS file_size TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS format TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '{}';
