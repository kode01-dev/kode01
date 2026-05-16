-- Migration: Create audit_logs table
-- SOC 2: Immutable audit trail for all critical actions
-- RLS: Only admins can read, no user can modify

SET search_path = '';

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  old_data JSONB,
  new_data JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast queries
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_event_type ON public.audit_logs(event_type);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
CREATE POLICY "Admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE public.profiles.id = auth.uid()
      AND public.profiles.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policy for regular users
-- Inserts happen server-side via service_role only

-- Helper function to log audit events (called from Edge Functions / triggers)
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_event_type TEXT,
  p_user_id UUID,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.audit_logs (event_type, user_id, old_data, new_data, metadata)
  VALUES (p_event_type, p_user_id, p_old_data, p_new_data, p_metadata)
  RETURNING id INTO v_log_id;
  RETURN v_log_id;
END;
$$;
