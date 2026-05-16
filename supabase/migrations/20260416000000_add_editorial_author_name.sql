-- Add author_name to editorial_posts
ALTER TABLE public.editorial_posts 
ADD COLUMN author_name TEXT;

COMMENT ON COLUMN public.editorial_posts.author_name IS 'Optional display name for external writers or special credits.';
