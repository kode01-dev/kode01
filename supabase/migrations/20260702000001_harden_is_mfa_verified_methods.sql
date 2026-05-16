-- Migration: Harden MFA claim verification for admin access controls
-- Covers AAL2 and all supported MFA methods observed in auth.jwt().amr.

SET search_path = '';

CREATE OR REPLACE FUNCTION public.is_mfa_verified()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    lower(COALESCE(auth.jwt() ->> 'aal', '')) = 'aal2'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(auth.jwt() -> 'amr', '[]'::jsonb)) AS amr_entry
      WHERE lower(COALESCE(amr_entry ->> 'method', '')) IN ('mfa', 'totp', 'otp', 'phone', 'webauthn')
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.is_mfa_verified() IS
  'Checks whether the current session is MFA-verified (AAL2 or recognized MFA method in JWT AMR).';
