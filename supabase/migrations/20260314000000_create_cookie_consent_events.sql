-- Migration: cookie consent evidence events for compliance dashboard
-- Stores pseudonymous consent events for auditability and reporting

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.cookie_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  anonymous_consent_id UUID NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('consent_first_choice', 'consent_updated', 'consent_withdrawn')),
  accepted_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  rejected_categories TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  consent_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('banner', 'preferences', 'settings')),
  locale TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cookie_consent_events_created_at
  ON public.cookie_consent_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cookie_consent_events_event_type
  ON public.cookie_consent_events(event_type);

CREATE INDEX IF NOT EXISTS idx_cookie_consent_events_user_id
  ON public.cookie_consent_events(user_id);

CREATE INDEX IF NOT EXISTS idx_cookie_consent_events_anonymous_consent_id
  ON public.cookie_consent_events(anonymous_consent_id);

CREATE INDEX IF NOT EXISTS idx_cookie_consent_events_accepted_categories
  ON public.cookie_consent_events USING GIN (accepted_categories);

ALTER TABLE public.cookie_consent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view cookie consent events" ON public.cookie_consent_events;
CREATE POLICY "Admins can view cookie consent events"
  ON public.cookie_consent_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
      AND pr.role = 'admin'
    )
  );

-- No INSERT/UPDATE/DELETE policies for users.
-- Writes are server-side only through service role.
