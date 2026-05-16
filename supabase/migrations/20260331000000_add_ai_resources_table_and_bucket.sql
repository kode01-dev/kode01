-- Migration to add ai_resources table and resources-covers bucket

-- Create the ai_resources table
CREATE TABLE IF NOT EXISTS public.ai_resources (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    title text NOT NULL,
    description text,
    url text UNIQUE NOT NULL,
    image_url text,
    provider text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.ai_resources ENABLE ROW LEVEL SECURITY;

-- Add RLS policy to allow inserts only from Service Role
CREATE POLICY "Enable insert for service role only" ON public.ai_resources
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- Add RLS policy to allow arbitrary reads for all users (if they need to see it on the frontend)
CREATE POLICY "Enable read access for all users" ON public.ai_resources
    FOR SELECT
    USING (true);

-- Create the storage bucket 'resources-covers' if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('resources-covers', 'resources-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for the resources-covers bucket
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING ( bucket_id = 'resources-covers' );

CREATE POLICY "Enable insert for service role only"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK ( bucket_id = 'resources-covers' );

CREATE POLICY "Enable update for service role only"
ON storage.objects FOR UPDATE
TO service_role
USING ( bucket_id = 'resources-covers' );

CREATE POLICY "Enable delete for service role only"
ON storage.objects FOR DELETE
TO service_role
USING ( bucket_id = 'resources-covers' );
