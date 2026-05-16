-- Migration: Prevent self-service privilege escalation and payout account tampering.
-- Users can still update non-sensitive profile fields, but cannot mutate role/plan/stripe_account_id.

SET search_path = '';

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (
      SELECT p.role
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
    AND plan_type = (
      SELECT p.plan_type
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
    AND stripe_account_id IS NOT DISTINCT FROM (
      SELECT p.stripe_account_id
      FROM public.profiles AS p
      WHERE p.id = auth.uid()
    )
  );
