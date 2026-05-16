-- Migration: add category support for editorial blog posts.

SET search_path = '';

ALTER TABLE public.editorial_posts
  ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_posts_category
  ON public.editorial_posts(category)
  WHERE category IS NOT NULL;
