-- Migration: Add default business profile fields for Stripe Connect prefill

SET search_path = '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_url TEXT NOT NULL DEFAULT 'https://www.kode01.com',
  ADD COLUMN IF NOT EXISTS business_description TEXT NOT NULL DEFAULT 'Digital assets and tools marketplace',
  ADD COLUMN IF NOT EXISTS business_mcc TEXT NOT NULL DEFAULT '5817';

UPDATE public.profiles
SET business_url = 'https://www.kode01.com'
WHERE business_url IS NULL OR btrim(business_url) = '';

UPDATE public.profiles
SET business_mcc = '5817'
WHERE business_mcc IS NULL OR btrim(business_mcc) = '' OR business_mcc !~ '^\d{4}$';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_business_mcc_format_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_business_mcc_format_check
      CHECK (business_mcc ~ '^\d{4}$');
  END IF;
END;
$$;
