-- Migration: external API monitoring v1 for admin safety dashboard
-- Adds per-call telemetry, endpoint health state, and admin notification template.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.external_api_call_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('inbound', 'outbound')),
  method TEXT,
  status_code INTEGER,
  success BOOLEAN NOT NULL DEFAULT FALSE,
  duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_external_api_call_events_created_at
  ON public.external_api_call_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_api_call_events_endpoint_created_at
  ON public.external_api_call_events(endpoint, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_external_api_call_events_success_created_at
  ON public.external_api_call_events(success, created_at DESC);

ALTER TABLE public.external_api_call_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view external api call events" ON public.external_api_call_events;
CREATE POLICY "Admins can view external api call events"
  ON public.external_api_call_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.api_monitor_endpoint_state (
  endpoint TEXT PRIMARY KEY,
  health_status TEXT NOT NULL CHECK (health_status IN ('green', 'yellow', 'red')),
  error_rate_percent NUMERIC(7, 4) NOT NULL DEFAULT 0,
  window_total INTEGER NOT NULL DEFAULT 0 CHECK (window_total >= 0),
  window_error INTEGER NOT NULL DEFAULT 0 CHECK (window_error >= 0),
  last_success_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_alerted_red_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_monitor_endpoint_state_health
  ON public.api_monitor_endpoint_state(health_status);

ALTER TABLE public.api_monitor_endpoint_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view endpoint monitor states" ON public.api_monitor_endpoint_state;
CREATE POLICY "Admins can view endpoint monitor states"
  ON public.api_monitor_endpoint_state FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS api_monitor_endpoint_state_updated_at ON public.api_monitor_endpoint_state;
CREATE TRIGGER api_monitor_endpoint_state_updated_at
  BEFORE UPDATE ON public.api_monitor_endpoint_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.notification_templates (
  key,
  name,
  description,
  subject_en,
  subject_fr,
  message_en,
  message_fr,
  email_enabled,
  in_app_enabled,
  is_active
)
VALUES (
  'api_monitor_endpoint_unhealthy',
  'API monitor endpoint unhealthy',
  'Sent to admins when a monitored endpoint transitions to red health state.',
  'API monitoring alert: {{endpoint}} is unhealthy',
  'Alerte monitoring API : {{endpoint}} est degrade',
  'Endpoint {{endpoint}} moved to red. Error rate {{errorRate}}% in {{windowHours}}h.',
  'Le endpoint {{endpoint}} est passe en rouge. Taux d erreur {{errorRate}}% sur {{windowHours}}h.',
  false,
  true,
  true
)
ON CONFLICT (key) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  subject_en = EXCLUDED.subject_en,
  subject_fr = EXCLUDED.subject_fr,
  message_en = EXCLUDED.message_en,
  message_fr = EXCLUDED.message_fr,
  email_enabled = EXCLUDED.email_enabled,
  in_app_enabled = EXCLUDED.in_app_enabled,
  is_active = EXCLUDED.is_active,
  updated_at = now();
