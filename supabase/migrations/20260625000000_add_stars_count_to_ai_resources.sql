-- Migration to add stars_count to ai_resources table
ALTER TABLE public.ai_resources
ADD COLUMN IF NOT EXISTS stars_count integer DEFAULT 0;

-- Add index on stars_count for performance (descending order for sorting)
CREATE INDEX IF NOT EXISTS idx_ai_resources_stars_count_desc 
ON public.ai_resources (stars_count DESC);
