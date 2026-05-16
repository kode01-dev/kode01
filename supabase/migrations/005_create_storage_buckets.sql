-- Migration: Configure Storage Buckets
-- SOC 2: Public covers, private vault with RLS

SET search_path = '';

-- Public bucket for product cover images
INSERT INTO storage.buckets (id, name, public)
VALUES ('covers', 'covers', true)
ON CONFLICT (id) DO NOTHING;

-- Private bucket for downloadable digital products
INSERT INTO storage.buckets (id, name, public)
VALUES ('vault', 'vault', false)
ON CONFLICT (id) DO NOTHING;

-- COVERS: Anyone can view cover images
CREATE POLICY "Public cover images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'covers');

-- COVERS: Sellers can upload cover images
CREATE POLICY "Sellers can upload covers"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'covers'
    AND auth.uid() IS NOT NULL
  );

-- COVERS: Sellers can update their own covers
CREATE POLICY "Sellers can update own covers"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'covers'
    AND auth.uid() = owner
  );

-- COVERS: Sellers can delete their own covers
CREATE POLICY "Sellers can delete own covers"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'covers'
    AND auth.uid() = owner
  );

-- VAULT: Only authenticated users who purchased can download (enforced via signed URLs)
-- No public SELECT policy = secure by default
-- Sellers can upload to vault
CREATE POLICY "Sellers can upload to vault"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'vault'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'seller'
    )
  );

-- Sellers can manage their own vault files
CREATE POLICY "Sellers can update own vault files"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'vault'
    AND auth.uid() = owner
  );

CREATE POLICY "Sellers can delete own vault files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'vault'
    AND auth.uid() = owner
  );
