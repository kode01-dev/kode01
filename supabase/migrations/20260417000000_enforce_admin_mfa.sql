-- Migration: Enforce MFA for Admins
-- SOC 2: Access control requires multi-factor authentication for administrative access

SET search_path = '';

-- Helper function to check if the current user session is MFA verified
CREATE OR REPLACE FUNCTION public.is_mfa_verified()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- Check 'amr' (Authentication Methods References) in JWT
  -- It should contain 'mfa' or specifically the factor type like 'totp'
  RETURN (
    SELECT 
      CASE 
        WHEN auth.jwt() -> 'amr' @> '[{"method": "totp"}]' THEN true
        WHEN auth.jwt() -> 'amr' @> '[{"method": "mfa"}]' THEN true
        ELSE false
      END
  );
END;
$$;

-- Policy to restrict Admin access to profiles ONLY if MFA is verified
-- Note: We wrap existing policies or add a new condition
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles with MFA"
  ON public.profiles FOR SELECT
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin' 
    AND public.is_mfa_verified()
  );

-- Require MFA for viewing audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs with MFA"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role = 'admin'
    )
    AND public.is_mfa_verified()
  );

COMMENT ON FUNCTION public.is_mfa_verified() IS 'Checks if the current session has a verified multi-factor authentication level.';
