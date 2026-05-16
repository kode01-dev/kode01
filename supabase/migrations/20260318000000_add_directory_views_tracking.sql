-- Migration: Add directory views tracking for popularity metrics
-- Tracks page views for directory items (MCP, AI Skills, Brain)

SET search_path = '';

-- Add views_count column to modules_directory for denormalization
ALTER TABLE public.modules_directory
ADD COLUMN IF NOT EXISTS views_count INTEGER NOT NULL DEFAULT 0;

-- Create directory_views table for detailed view tracking
CREATE TABLE IF NOT EXISTS public.directory_views (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    directory_id UUID NOT NULL REFERENCES public.modules_directory(id) ON DELETE CASCADE,
    view_date DATE NOT NULL DEFAULT CURRENT_DATE,
    count INTEGER NOT NULL DEFAULT 1,
    UNIQUE(directory_id, view_date)
);

-- Create indices for performance
CREATE INDEX IF NOT EXISTS idx_directory_views_directory_id ON public.directory_views(directory_id);
CREATE INDEX IF NOT EXISTS idx_directory_views_view_date ON public.directory_views(view_date);
CREATE INDEX IF NOT EXISTS idx_modules_directory_views_count ON public.modules_directory(views_count DESC);

ALTER TABLE public.directory_views ENABLE ROW LEVEL SECURITY;

-- Public can view directory views (read-only)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public can view directory views' AND tablename = 'directory_views') THEN
        CREATE POLICY "Public can view directory views"
            ON public.directory_views FOR SELECT
            USING (true);
    END IF;
END $$;

-- Server role can insert/update views
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can track directory views' AND tablename = 'directory_views') THEN
        CREATE POLICY "Authenticated users can track directory views"
            ON public.directory_views FOR INSERT
            WITH CHECK (true);
    END IF;
END $$;

-- Update modules_directory to include views_count index
CREATE OR REPLACE FUNCTION public.increment_directory_views(p_directory_id UUID)
RETURNS void AS $$
BEGIN
    -- Insert or update view count for today
    INSERT INTO public.directory_views (directory_id, view_date, count)
    VALUES (p_directory_id, CURRENT_DATE, 1)
    ON CONFLICT (directory_id, view_date)
    DO UPDATE SET count = public.directory_views.count + 1;

    -- Update total views_count on modules_directory
    UPDATE public.modules_directory
    SET views_count = (
        SELECT COALESCE(SUM(dv.count), 0)
        FROM public.directory_views dv
        WHERE dv.directory_id = p_directory_id
    )
    WHERE public.modules_directory.id = p_directory_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.increment_directory_views(UUID) TO authenticated, anon;
