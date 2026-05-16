-- Migration: Internal editorial CMS (blog articles)
-- Adds editorial_posts table, RLS policies, and editorial storage bucket.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.editorial_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_group_id UUID NOT NULL DEFAULT gen_random_uuid(),
  source_locale TEXT NOT NULL DEFAULT 'en' CHECK (source_locale IN ('en', 'fr')),
  locale TEXT NOT NULL CHECK (locale IN ('en', 'fr')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  slug TEXT NOT NULL CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title TEXT NOT NULL,
  excerpt TEXT,
  content_markdown TEXT NOT NULL DEFAULT '',
  cover_image_url TEXT,
  seo_title TEXT,
  seo_description TEXT,
  view_count INTEGER DEFAULT 0 NOT NULL,
  click_count INTEGER DEFAULT 0 NOT NULL,
  last_viewed_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (locale, slug),
  UNIQUE (translation_group_id, locale)
);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_status_published_at
  ON public.editorial_posts(status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_locale_status_published_at
  ON public.editorial_posts(locale, status, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_translation_group
  ON public.editorial_posts(translation_group_id);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_view_count
  ON public.editorial_posts(view_count DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_tracking
  ON public.editorial_posts(locale, status, view_count DESC, click_count DESC);

DROP TRIGGER IF EXISTS editorial_posts_updated_at ON public.editorial_posts;
CREATE TRIGGER editorial_posts_updated_at
  BEFORE UPDATE ON public.editorial_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.editorial_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read published editorial posts" ON public.editorial_posts;
CREATE POLICY "Public can read published editorial posts"
  ON public.editorial_posts
  FOR SELECT
  USING (status = 'published');

DROP POLICY IF EXISTS "Admins can read all editorial posts" ON public.editorial_posts;
CREATE POLICY "Admins can read all editorial posts"
  ON public.editorial_posts
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert editorial posts" ON public.editorial_posts;
CREATE POLICY "Admins can insert editorial posts"
  ON public.editorial_posts
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update editorial posts" ON public.editorial_posts;
CREATE POLICY "Admins can update editorial posts"
  ON public.editorial_posts
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete editorial posts" ON public.editorial_posts;
CREATE POLICY "Admins can delete editorial posts"
  ON public.editorial_posts
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('editorial', 'editorial', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Editorial public read" ON storage.objects;
CREATE POLICY "Editorial public read"
ON storage.objects
FOR SELECT
USING (bucket_id = 'editorial');

DROP POLICY IF EXISTS "Editorial service role insert" ON storage.objects;
CREATE POLICY "Editorial service role insert"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'editorial');

DROP POLICY IF EXISTS "Editorial service role update" ON storage.objects;
CREATE POLICY "Editorial service role update"
ON storage.objects
FOR UPDATE
TO service_role
USING (bucket_id = 'editorial')
WITH CHECK (bucket_id = 'editorial');

DROP POLICY IF EXISTS "Editorial service role delete" ON storage.objects;
CREATE POLICY "Editorial service role delete"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'editorial');
