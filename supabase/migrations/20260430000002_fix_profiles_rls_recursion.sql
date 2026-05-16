-- Migration: Fix profiles RLS recursion reintroduced by secure profile access policy
-- Symptoms: PostgREST 500 errors on /rest/v1/profiles and dashboard redirect loops.

SET search_path = '';

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  );
$$;

COMMENT ON FUNCTION public.current_user_is_admin() IS 'Returns true when the current authenticated user has admin role.';

-- Remove recursive policy added by secure_profile_stripe_ids migration.
DROP POLICY IF EXISTS "Users and admins can view full profile" ON public.profiles;

-- Reassert non-recursive admin policies guarded by MFA.
DROP POLICY IF EXISTS "Admins can view all profiles with MFA" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles with MFA"
  ON public.profiles FOR SELECT
  USING (
    public.current_user_is_admin()
    AND public.is_mfa_verified()
  );

DROP POLICY IF EXISTS "Admins can view audit logs with MFA" ON public.audit_logs;
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs with MFA"
  ON public.audit_logs FOR SELECT
  USING (
    public.current_user_is_admin()
    AND public.is_mfa_verified()
  );
