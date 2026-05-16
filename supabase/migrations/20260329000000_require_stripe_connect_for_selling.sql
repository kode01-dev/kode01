-- Migration: Require fully onboarded Stripe Connect for any selling actions
-- Enforce at DB layer via RLS and depublish non-compliant published products

SET search_path = '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_details_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS stripe_onboarding_completed_at TIMESTAMPTZ;

DROP POLICY IF EXISTS "Sellers can insert own products" ON public.products;
DROP POLICY IF EXISTS "Sellers can update own products" ON public.products;

CREATE POLICY "Sellers can insert own products"
  ON public.products FOR INSERT
  WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'seller'
        AND pr.stripe_account_id IS NOT NULL
        AND pr.stripe_charges_enabled IS TRUE
        AND pr.stripe_payouts_enabled IS TRUE
    )
  );

CREATE POLICY "Sellers can update own products"
  ON public.products FOR UPDATE
  USING (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'seller'
        AND pr.stripe_account_id IS NOT NULL
        AND pr.stripe_charges_enabled IS TRUE
        AND pr.stripe_payouts_enabled IS TRUE
    )
  )
  WITH CHECK (
    auth.uid() = seller_id
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'seller'
        AND pr.stripe_account_id IS NOT NULL
        AND pr.stripe_charges_enabled IS TRUE
        AND pr.stripe_payouts_enabled IS TRUE
    )
  );

UPDATE public.products AS p
SET status = 'draft'
WHERE p.status = 'published'
  AND EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = p.seller_id
      AND NOT (
        pr.role = 'seller'
        AND pr.stripe_account_id IS NOT NULL
        AND pr.stripe_charges_enabled IS TRUE
        AND pr.stripe_payouts_enabled IS TRUE
      )
  );
