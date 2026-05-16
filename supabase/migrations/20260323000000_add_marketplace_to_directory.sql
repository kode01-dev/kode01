-- Migration: Add marketplace fields to directory
-- Description: Adds price, tech_stack, and demo_url to modules_directory and updates the type constraint.

-- 1. Add new columns
ALTER TABLE public.modules_directory 
ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS tech_stack TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS demo_url TEXT DEFAULT NULL;

-- 2. Update the type constraint
-- We need to drop the old constraint and add a new one because Postgres doesn't allow direct modification of CHECK constraints easily.
DO $$ 
BEGIN
    ALTER TABLE public.modules_directory DROP CONSTRAINT IF EXISTS modules_directory_type_check;
    ALTER TABLE public.modules_directory ADD CONSTRAINT modules_directory_type_check 
    CHECK (type IN ('mcp_server', 'ai_skill', 'agent', 'ui', 'mcp_registry', 'local_ai', 'open_source_app', 'ai_model', 'built_app'));
END $$;

-- 3. Update comments for clarity
COMMENT ON COLUMN public.modules_directory.price IS 'Price of the application if it is a marketplace item (built_app).';
COMMENT ON COLUMN public.modules_directory.tech_stack IS 'Array of technologies used in the application (e.g., Next.js, Tailwind, Supabase).';
COMMENT ON COLUMN public.modules_directory.demo_url IS 'URL to a live demo of the application.';
