SET search_path = '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS content_locales TEXT[],
  ADD COLUMN IF NOT EXISTS content_source_locale TEXT;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_content_locales_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_content_locales_check
  CHECK (
    content_locales IS NULL
    OR (
      array_length(content_locales, 1) >= 1
      AND content_locales <@ ARRAY['fr', 'en']::TEXT[]
    )
  );

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_content_source_locale_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_content_source_locale_check
  CHECK (
    content_source_locale IS NULL
    OR content_source_locale IN ('fr', 'en')
  );

CREATE INDEX IF NOT EXISTS idx_products_content_locales
  ON public.products USING gin (content_locales);

CREATE INDEX IF NOT EXISTS idx_products_content_source_locale
  ON public.products(content_source_locale);
