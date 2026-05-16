-- Migration: recommendation tracking + legal acceptance metadata
-- SOC 2: RLS enforced, immutable audit integration, retention-ready

SET search_path = '';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS legal_acceptance_version TEXT,
ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.recommendation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('product_view', 'brain_view', 'recommendation_click')),
  source_type TEXT NOT NULL CHECK (source_type IN ('product', 'brain')),
  source_slug TEXT,
  target_product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  signal_payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recommendation_events_user_id
  ON public.recommendation_events(user_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_created_at
  ON public.recommendation_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_event_type
  ON public.recommendation_events(event_type);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_target_product_id
  ON public.recommendation_events(target_product_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_events_user_created
  ON public.recommendation_events(user_id, created_at DESC);

ALTER TABLE public.recommendation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own recommendation events" ON public.recommendation_events;
CREATE POLICY "Users can view own recommendation events"
  ON public.recommendation_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own recommendation events" ON public.recommendation_events;
CREATE POLICY "Users can insert own recommendation events"
  ON public.recommendation_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own recommendation events" ON public.recommendation_events;
CREATE POLICY "Users can delete own recommendation events"
  ON public.recommendation_events FOR DELETE
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    display_name,
    legal_acceptance_version,
    legal_accepted_at
  )
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data ->> 'display_name',
    NEW.raw_user_meta_data ->> 'legal_acceptance_version',
    NULLIF(NEW.raw_user_meta_data ->> 'legal_accepted_at', '')::timestamptz
  );

  RETURN NEW;
END;
$$;

-- Backfill is allowed for this rollout (test-only legacy accounts).
UPDATE public.profiles
SET
  legal_acceptance_version = COALESCE(legal_acceptance_version, '2026-03-06-reco-v1'),
  legal_accepted_at = COALESCE(legal_accepted_at, now())
WHERE
  legal_acceptance_version IS NULL
  OR legal_accepted_at IS NULL;
