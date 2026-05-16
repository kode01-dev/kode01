-- Migration: Add idempotent webhook processing table

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'processed', 'failed')),
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
  ON public.stripe_webhook_events(status);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_created_at
  ON public.stripe_webhook_events(created_at DESC);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view stripe webhook events" ON public.stripe_webhook_events;

CREATE POLICY "Admins can view stripe webhook events"
  ON public.stripe_webhook_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
      AND pr.role = 'admin'
    )
  );

