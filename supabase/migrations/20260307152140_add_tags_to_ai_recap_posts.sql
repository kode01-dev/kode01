-- Migration to add tags to AI recap posts
DO $$
BEGIN
  IF to_regclass('public.ai_recap_posts') IS NOT NULL THEN
    ALTER TABLE public.ai_recap_posts
    ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

    UPDATE public.ai_recap_posts SET tags = '{}' WHERE tags IS NULL;

    CREATE INDEX IF NOT EXISTS idx_ai_recap_posts_tags ON public.ai_recap_posts USING gin (tags);
  END IF;
END $$;
