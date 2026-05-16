-- Migration: add immutable profile slug for dashboard subdomain routing
-- SOC 2: deterministic slug generation, uniqueness enforcement, immutable identifier

SET search_path = '';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS slug TEXT;

CREATE OR REPLACE FUNCTION public.slugify_profile_value(input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(input, '')), '[^a-z0-9]+', '-', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.generate_unique_profile_slug(
  base_value TEXT,
  profile_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix INTEGER := 1;
BEGIN
  base_slug := public.slugify_profile_value(base_value);

  IF base_slug IS NULL OR base_slug = '' THEN
    base_slug := 'user';
  END IF;

  candidate := base_slug;

  WHILE EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.slug = candidate
      AND (profile_id IS NULL OR p.id <> profile_id)
  ) LOOP
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix::TEXT;
  END LOOP;

  RETURN candidate;
END;
$$;

DO $$
DECLARE
  row_record RECORD;
  base_value TEXT;
BEGIN
  FOR row_record IN
    SELECT
      p.id,
      p.slug,
      p.display_name,
      u.email
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.created_at, p.id
  LOOP
    IF row_record.slug IS NULL OR row_record.slug = '' THEN
      base_value := COALESCE(
        NULLIF(row_record.display_name, ''),
        NULLIF(split_part(COALESCE(row_record.email, ''), '@', 1), ''),
        row_record.id::TEXT
      );

      UPDATE public.profiles
      SET slug = public.generate_unique_profile_slug(base_value, row_record.id)
      WHERE id = row_record.id;
    END IF;
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_slug_format_chk'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_slug_format_chk
      CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$');
  END IF;
END;
$$;

ALTER TABLE public.profiles
ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_slug_unique
ON public.profiles(slug);

CREATE OR REPLACE FUNCTION public.prevent_profile_slug_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'Profile slug is immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_slug_immutable ON public.profiles;
CREATE TRIGGER profiles_slug_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_slug_update();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  preferred_display_name TEXT;
  email_username TEXT;
  generated_slug TEXT;
BEGIN
  preferred_display_name := NULLIF(NEW.raw_user_meta_data ->> 'display_name', '');
  email_username := NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), '');
  generated_slug := public.generate_unique_profile_slug(
    COALESCE(preferred_display_name, email_username, NEW.id::TEXT),
    NEW.id
  );

  INSERT INTO public.profiles (
    id,
    display_name,
    slug,
    legal_acceptance_version,
    legal_accepted_at
  )
  VALUES (
    NEW.id,
    preferred_display_name,
    generated_slug,
    NEW.raw_user_meta_data ->> 'legal_acceptance_version',
    NULLIF(NEW.raw_user_meta_data ->> 'legal_accepted_at', '')::timestamptz
  );

  RETURN NEW;
END;
$$;

