-- Migration: CAD-first pricing fields while preserving USD legacy columns

SET search_path = '';

-- Pricing plans: add neutral amount/currency fields
ALTER TABLE public.ad_pricing_plans
  ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE public.ad_pricing_plans
SET
  price = COALESCE(price, price_usd),
  currency = COALESCE(NULLIF(lower(currency), ''), 'usd');

ALTER TABLE public.ad_pricing_plans
  ALTER COLUMN price SET DEFAULT 0,
  ALTER COLUMN price SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'cad',
  ALTER COLUMN currency SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_pricing_plans_currency_format_check'
  ) THEN
    ALTER TABLE public.ad_pricing_plans
      ADD CONSTRAINT ad_pricing_plans_currency_format_check
      CHECK (currency ~ '^[a-z]{3}$');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_pricing_plans_price_nonnegative_check'
  ) THEN
    ALTER TABLE public.ad_pricing_plans
      ADD CONSTRAINT ad_pricing_plans_price_nonnegative_check
      CHECK (price >= 0);
  END IF;
END
$$;

-- Campaigns: add neutral total/currency fields
ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS total_price NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE public.ad_campaigns
SET
  total_price = COALESCE(total_price, total_price_usd, 0),
  currency = COALESCE(NULLIF(lower(currency), ''), 'usd');

ALTER TABLE public.ad_campaigns
  ALTER COLUMN total_price SET DEFAULT 0,
  ALTER COLUMN total_price SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'cad',
  ALTER COLUMN currency SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_campaigns_currency_format_check'
  ) THEN
    ALTER TABLE public.ad_campaigns
      ADD CONSTRAINT ad_campaigns_currency_format_check
      CHECK (currency ~ '^[a-z]{3}$');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_campaigns_total_price_nonnegative_check'
  ) THEN
    ALTER TABLE public.ad_campaigns
      ADD CONSTRAINT ad_campaigns_total_price_nonnegative_check
      CHECK (total_price >= 0);
  END IF;
END
$$;

-- Orders: add neutral amount field, keep legacy amount_usd for compatibility
ALTER TABLE public.ad_orders
  ADD COLUMN IF NOT EXISTS amount NUMERIC(10, 2);

UPDATE public.ad_orders
SET
  amount = COALESCE(amount, amount_usd),
  currency = COALESCE(NULLIF(lower(currency), ''), 'usd');

ALTER TABLE public.ad_orders
  ALTER COLUMN amount SET DEFAULT 0,
  ALTER COLUMN amount SET NOT NULL,
  ALTER COLUMN currency SET DEFAULT 'cad',
  ALTER COLUMN currency SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_orders_currency_format_check'
  ) THEN
    ALTER TABLE public.ad_orders
      ADD CONSTRAINT ad_orders_currency_format_check
      CHECK (currency ~ '^[a-z]{3}$');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ad_orders_amount_nonnegative_check'
  ) THEN
    ALTER TABLE public.ad_orders
      ADD CONSTRAINT ad_orders_amount_nonnegative_check
      CHECK (amount >= 0);
  END IF;
END
$$;

-- Purchases: add currency tracking for real presentment currency from Stripe
ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS currency TEXT;

UPDATE public.purchases
SET currency = COALESCE(NULLIF(lower(currency), ''), 'usd');

ALTER TABLE public.purchases
  ALTER COLUMN currency SET DEFAULT 'usd',
  ALTER COLUMN currency SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_currency_format_check'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_currency_format_check
      CHECK (currency ~ '^[a-z]{3}$');
  END IF;
END
$$;
