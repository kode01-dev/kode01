-- Backfill missing profile slugs for seed/test vendors
-- Generates slugs from shop_name or display_name using simple slugification

SET search_path = '';

-- Ensure slug column exists
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS slug TEXT;

-- Temporarily disable the immutability trigger if it exists
DROP TRIGGER IF EXISTS profiles_slug_immutable ON public.profiles;

-- Backfill slugs for profiles that don't have one
UPDATE public.profiles
SET slug = trim(both '-' from regexp_replace(lower(coalesce(shop_name, display_name, id::text)), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- Handle any duplicates by appending a suffix
DO $$
DECLARE
  dup RECORD;
  suffix INTEGER;
  candidate TEXT;
BEGIN
  FOR dup IN
    SELECT id, slug
    FROM public.profiles
    WHERE slug IN (
      SELECT slug FROM public.profiles GROUP BY slug HAVING count(*) > 1
    )
    ORDER BY created_at, id
  LOOP
    -- Check if this exact slug is already taken by someone else
    IF EXISTS (
      SELECT 1 FROM public.profiles
      WHERE slug = dup.slug AND id <> dup.id
    ) THEN
      suffix := 2;
      candidate := dup.slug || '-' || suffix::text;
      WHILE EXISTS (SELECT 1 FROM public.profiles WHERE slug = candidate) LOOP
        suffix := suffix + 1;
        candidate := dup.slug || '-' || suffix::text;
      END LOOP;
      UPDATE public.profiles SET slug = candidate WHERE id = dup.id;
    END IF;
  END LOOP;
END;
$$;

-- Re-create the immutability trigger if the function exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'prevent_profile_slug_update') THEN
    CREATE TRIGGER profiles_slug_immutable
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.prevent_profile_slug_update();
  END IF;
END;
$$;
