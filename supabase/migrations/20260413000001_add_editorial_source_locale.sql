-- Migration: allow selecting EN or FR as source locale for editorial groups.

SET search_path = '';

ALTER TABLE public.editorial_posts
  ADD COLUMN IF NOT EXISTS source_locale TEXT;

UPDATE public.editorial_posts
SET source_locale = COALESCE(source_locale, locale)
WHERE source_locale IS NULL;

ALTER TABLE public.editorial_posts
  ALTER COLUMN source_locale SET DEFAULT 'en';

ALTER TABLE public.editorial_posts
  ALTER COLUMN source_locale SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'editorial_posts_source_locale_check'
      AND conrelid = 'public.editorial_posts'::regclass
  ) THEN
    ALTER TABLE public.editorial_posts
      ADD CONSTRAINT editorial_posts_source_locale_check CHECK (source_locale IN ('en', 'fr'));
  END IF;
END $$;
