-- Migration: Create content_moderation_reports table
-- Stripe Compliance: "Bouton de signalement" requirement
-- RLS: Anyone (authenticated or anonymous) can insert, only admins can view/manage

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.content_moderation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_moderation_reports_product_id ON public.content_moderation_reports(product_id);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_status ON public.content_moderation_reports(status);
CREATE INDEX IF NOT EXISTS idx_moderation_reports_created_at ON public.content_moderation_reports(created_at DESC);

-- Enable RLS
ALTER TABLE public.content_moderation_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to insert reports
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can insert reports' AND tablename = 'content_moderation_reports') THEN
        CREATE POLICY "Authenticated users can insert reports"
          ON public.content_moderation_reports
          FOR INSERT
          TO authenticated
          WITH CHECK (auth.uid() = reporter_id);
    END IF;
END $$;

-- Policy: Allow anonymous users to insert reports (for compliance "anyone can report")
-- Note: We set reporter_id to NULL for anonymous reports
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anonymous users can insert reports' AND tablename = 'content_moderation_reports') THEN
        CREATE POLICY "Anonymous users can insert reports"
          ON public.content_moderation_reports
          FOR INSERT
          TO anon
          WITH CHECK (reporter_id IS NULL);
    END IF;
END $$;

-- Policy: Only admins can view and manage reports
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can view and manage reports' AND tablename = 'content_moderation_reports') THEN
        CREATE POLICY "Admins can view and manage reports"
          ON public.content_moderation_reports
          FOR SELECT
          TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM public.profiles
              WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
            )
          );
    END IF;
END $$;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can update reports' AND tablename = 'content_moderation_reports') THEN
        CREATE POLICY "Admins can update reports"
          ON public.content_moderation_reports
          FOR UPDATE
          TO authenticated
          USING (
            EXISTS (
              SELECT 1 FROM public.profiles
              WHERE public.profiles.id = auth.uid()
              AND public.profiles.role = 'admin'
            )
          );
    END IF;
END $$;
