-- Migration: add_slug_to_ai_resources
-- Created at: 2026-03-09

-- Step 1: Add the slug column as nullable first
ALTER TABLE public.ai_resources ADD COLUMN IF NOT EXISTS slug TEXT;

-- Step 2: Update existing rows with a generated slug if null
-- Simple slugify: lowercase, replace non-alphanumeric with hyphen
UPDATE public.ai_resources 
SET slug = LOWER(REGEXP_REPLACE(title, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

-- Remove leading/trailing hyphens
UPDATE public.ai_resources 
SET slug = TRIM(BOTH '-' FROM slug)
WHERE slug LIKE '-%' OR slug LIKE '%-';

-- Step 3: Handle potential duplicates (append substring of ID suffix if necessary)
UPDATE public.ai_resources ar
SET slug = ar.slug || '-' || SUBSTRING(ar.id::text, 1, 4)
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) as rn
    FROM public.ai_resources
) d
WHERE ar.id = d.id AND d.rn > 1;

-- Step 4: Make it NOT NULL and UNIQUE
ALTER TABLE public.ai_resources ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.ai_resources ADD CONSTRAINT ai_resources_slug_key UNIQUE (slug);
