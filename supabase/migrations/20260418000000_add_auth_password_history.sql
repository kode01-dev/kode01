-- Migration: Add password history table for SOC 2 password reuse prevention
-- Stores recent password hashes per user (service-role access only).

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.auth_password_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_password_history_user_changed_at
  ON public.auth_password_history(user_id, changed_at DESC);

ALTER TABLE public.auth_password_history ENABLE ROW LEVEL SECURITY;

-- Intentionally no user-facing RLS policies.
-- Table is written/read server-side with service-role credentials.

COMMENT ON TABLE public.auth_password_history IS
  'Recent password hashes used to prevent reuse of the last N passwords.';
