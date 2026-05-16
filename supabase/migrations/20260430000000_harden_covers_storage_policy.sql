-- Migration: Harden public covers bucket write policies.
-- KODE-SEC-007: prevent arbitrary authenticated uploads to covers.

SET search_path = '';

DROP POLICY IF EXISTS "Sellers can upload covers" ON storage.objects;
DROP POLICY IF EXISTS "Sellers can update own covers" ON storage.objects;
DROP POLICY IF EXISTS "Sellers can delete own covers" ON storage.objects;

CREATE POLICY "Sellers and admins can upload covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'covers'
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('seller', 'admin')
    )
  );

CREATE POLICY "Sellers and admins can update own covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'covers'
    AND auth.uid() = owner
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('seller', 'admin')
    )
  )
  WITH CHECK (
    bucket_id = 'covers'
    AND auth.uid() = owner
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('seller', 'admin')
    )
  );

CREATE POLICY "Sellers and admins can delete own covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'covers'
    AND auth.uid() = owner
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role IN ('seller', 'admin')
    )
  );
