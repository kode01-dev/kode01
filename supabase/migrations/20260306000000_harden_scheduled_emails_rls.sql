-- Migration: Harden scheduled_emails RLS policies
-- Goal: remove permissive policy and keep scoped read access only

SET search_path = '';

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage all scheduled emails" ON public.scheduled_emails;
DROP POLICY IF EXISTS "Sellers can view scheduled emails for their customers" ON public.scheduled_emails;
DROP POLICY IF EXISTS "Sellers can view scheduled emails for their sales" ON public.scheduled_emails;
DROP POLICY IF EXISTS "Admins can view scheduled emails" ON public.scheduled_emails;

CREATE POLICY "Sellers can view scheduled emails for their customers"
  ON public.scheduled_emails
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchases p
      WHERE p.id = scheduled_emails.purchase_id
      AND p.seller_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view scheduled emails"
  ON public.scheduled_emails
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
      AND pr.role = 'admin'
    )
  );

