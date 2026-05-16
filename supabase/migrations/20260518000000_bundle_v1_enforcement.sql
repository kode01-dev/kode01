-- Migration: Bundle V1 enforcement (single-seller bundles + derived purchases)
-- Purpose:
-- 1) Harden bundle composition rules in product_bundle_items
-- 2) Add derived-purchase tracking for bundle fan-out

SET search_path = '';

-- ---------------------------------------------------------------------------
-- Purchases: derived rows created from a bundle checkout
-- ---------------------------------------------------------------------------

ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS is_bundle_derived BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_bundle_purchase_id UUID REFERENCES public.purchases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchases_source_bundle_purchase_id
  ON public.purchases(source_bundle_purchase_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchases_bundle_derived_source_required'
  ) THEN
    ALTER TABLE public.purchases
      ADD CONSTRAINT purchases_bundle_derived_source_required
      CHECK (
        (is_bundle_derived = false AND source_bundle_purchase_id IS NULL)
        OR (is_bundle_derived = true AND source_bundle_purchase_id IS NOT NULL)
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_bundle_derived_unique
  ON public.purchases(source_bundle_purchase_id, product_id, buyer_id)
  WHERE is_bundle_derived = true AND source_bundle_purchase_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Bundle integrity: enforce mono-seller and shape constraints
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'product_bundle_items_no_self_reference'
  ) THEN
    ALTER TABLE public.product_bundle_items
      ADD CONSTRAINT product_bundle_items_no_self_reference
      CHECK (bundle_id <> product_id);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_product_bundle_item_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  bundle_row RECORD;
  item_row RECORD;
BEGIN
  IF NEW.bundle_id = NEW.product_id THEN
    RAISE EXCEPTION 'bundle_id and product_id must be different';
  END IF;

  SELECT id, seller_id, is_bundle
  INTO bundle_row
  FROM public.products
  WHERE id = NEW.bundle_id;

  IF bundle_row.id IS NULL THEN
    RAISE EXCEPTION 'Bundle product does not exist: %', NEW.bundle_id;
  END IF;

  IF bundle_row.is_bundle IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'bundle_id must reference a product with is_bundle=true';
  END IF;

  SELECT id, seller_id, is_bundle
  INTO item_row
  FROM public.products
  WHERE id = NEW.product_id;

  IF item_row.id IS NULL THEN
    RAISE EXCEPTION 'Included product does not exist: %', NEW.product_id;
  END IF;

  IF item_row.is_bundle IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'product_id must reference a non-bundle product';
  END IF;

  IF bundle_row.seller_id IS DISTINCT FROM item_row.seller_id THEN
    RAISE EXCEPTION 'Bundle and included product must belong to the same seller';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_validate_product_bundle_item_integrity'
      AND tgrelid = 'public.product_bundle_items'::regclass
  ) THEN
    CREATE TRIGGER trg_validate_product_bundle_item_integrity
      BEFORE INSERT OR UPDATE ON public.product_bundle_items
      FOR EACH ROW
      EXECUTE FUNCTION public.validate_product_bundle_item_integrity();
  END IF;
END
$$;
