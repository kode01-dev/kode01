-- Migration: Setup Supabase Vault POC
-- SOC 2: Field-level encryption for ultra-sensitive secrets
-- Vault is the recommended alternative to pg_sodium for TCE (Transparent Column Encryption)

-- 1. Enable Vault (if not already enabled)
CREATE EXTENSION IF NOT EXISTS "vault" WITH SCHEMA "vault";

-- 2. Procedure to create a secret
-- Usage: SELECT vault.create_secret('my_value', 'my_secret_name', 'description');
-- The 'my_value' is encrypted and stored in vault.secrets.

-- 3. Procedure to get a secret (must be run as authenticated or service_role)
-- Usage: SELECT secret FROM vault.secrets WHERE name = 'my_secret_name';

-- Example: Encapsulating Vault in a custom schema for application use
CREATE SCHEMA IF NOT EXISTS "security";

-- Function to store a user's sensitive PII (demonstration)
CREATE OR REPLACE FUNCTION security.store_sensitive_data(
  p_user_id UUID,
  p_data TEXT,
  p_label TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_id UUID;
BEGIN
  -- We store the secret in Vault with a unique name/label linked to the user
  SELECT id INTO v_secret_id 
  FROM vault.create_secret(
    p_data, 
    'user_data_' || p_user_id::text || '_' || p_label, 
    'PII for user ' || p_user_id::text
  );
  
  RETURN v_secret_id;
END;
$$;

COMMENT ON SCHEMA security IS 'Schema for handling sensitive operations and encryption wrappers.';
