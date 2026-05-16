-- Migration: Add editable schedule settings for AI recap cron runs.
-- Allows admin users to tune days/hours from the dashboard without redeploying.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.ai_recap_schedule_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  timezone TEXT NOT NULL DEFAULT 'America/Toronto',
  slot_a_day SMALLINT NOT NULL DEFAULT 2 CHECK (slot_a_day BETWEEN 0 AND 6),
  slot_a_hour SMALLINT NOT NULL DEFAULT 12 CHECK (slot_a_hour BETWEEN 0 AND 23),
  slot_a_minute SMALLINT NOT NULL DEFAULT 0 CHECK (slot_a_minute IN (0, 15, 30, 45)),
  slot_b_day SMALLINT NOT NULL DEFAULT 5 CHECK (slot_b_day BETWEEN 0 AND 6),
  slot_b_hour SMALLINT NOT NULL DEFAULT 12 CHECK (slot_b_hour BETWEEN 0 AND 23),
  slot_b_minute SMALLINT NOT NULL DEFAULT 0 CHECK (slot_b_minute IN (0, 15, 30, 45)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS ai_recap_schedule_settings_updated_at ON public.ai_recap_schedule_settings;
CREATE TRIGGER ai_recap_schedule_settings_updated_at
  BEFORE UPDATE ON public.ai_recap_schedule_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ai_recap_schedule_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read ai recap schedule settings" ON public.ai_recap_schedule_settings;
CREATE POLICY "Admins can read ai recap schedule settings"
  ON public.ai_recap_schedule_settings
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can insert ai recap schedule settings" ON public.ai_recap_schedule_settings;
CREATE POLICY "Admins can insert ai recap schedule settings"
  ON public.ai_recap_schedule_settings
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

DROP POLICY IF EXISTS "Admins can update ai recap schedule settings" ON public.ai_recap_schedule_settings;
CREATE POLICY "Admins can update ai recap schedule settings"
  ON public.ai_recap_schedule_settings
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin')
  );

INSERT INTO public.ai_recap_schedule_settings (
  id,
  is_enabled,
  timezone,
  slot_a_day,
  slot_a_hour,
  slot_a_minute,
  slot_b_day,
  slot_b_hour,
  slot_b_minute
)
VALUES (
  TRUE,
  TRUE,
  'America/Toronto',
  2,
  12,
  0,
  5,
  12,
  0
)
ON CONFLICT (id) DO NOTHING;
