-- Migration: Harden vault upload policy to seller-only
-- Fixes KODE-SEC-007 by preventing any authenticated non-seller from uploading into vault.

SET search_path = '';

DROP POLICY IF EXISTS "Sellers can upload to vault" ON storage.objects;

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
