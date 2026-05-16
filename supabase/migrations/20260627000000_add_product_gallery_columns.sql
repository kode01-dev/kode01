-- Migration: Add video demo and multi-image gallery support to products
-- Adds video_url for YouTube/Loom/Vimeo embeds and gallery_urls for additional images.

SET search_path = '';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.products.video_url IS 'Embed URL for YouTube, Loom, or Vimeo video demo';
COMMENT ON COLUMN public.products.gallery_urls IS 'Array of additional image URLs for the product gallery';
