-- Add view and click tracking columns to editorial_posts
DO $$
BEGIN
  IF to_regclass('public.editorial_posts') IS NULL THEN
    RETURN;
  END IF;

  ALTER TABLE public.editorial_posts
    ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS click_count INTEGER DEFAULT 0 NOT NULL,
    ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ;

  CREATE INDEX IF NOT EXISTS idx_editorial_posts_view_count
    ON public.editorial_posts(view_count DESC);

  CREATE INDEX IF NOT EXISTS idx_editorial_posts_tracking
    ON public.editorial_posts(locale, status, view_count DESC, click_count DESC);
END $$;
