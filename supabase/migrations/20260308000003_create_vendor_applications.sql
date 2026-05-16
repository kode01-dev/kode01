-- Migration: Buyer to seller application flow

SET search_path = '';

CREATE TABLE public.vendor_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  product_type TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_applications_user_id_created_at
  ON public.vendor_applications(user_id, created_at DESC);

CREATE INDEX idx_vendor_applications_status_created_at
  ON public.vendor_applications(status, created_at DESC);

ALTER TABLE public.vendor_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own vendor applications"
  ON public.vendor_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users and admins can view vendor applications"
  ON public.vendor_applications FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );
