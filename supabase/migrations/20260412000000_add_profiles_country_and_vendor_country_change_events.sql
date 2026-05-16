-- Migration: Multi-country Stripe Connect onboarding and safe country-change audit trail

SET search_path = '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS country TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_country_format_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_country_format_check
      CHECK (country IS NULL OR country ~ '^[A-Z]{2}$');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_profile_country_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.country IS NOT NULL THEN
    NEW.country := upper(btrim(NEW.country));
    IF NEW.country = '' THEN
      NEW.country := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_normalize_country ON public.profiles;

CREATE TRIGGER profiles_normalize_country
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_profile_country_code();

CREATE OR REPLACE FUNCTION public.prevent_profile_country_change_after_stripe_connect()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.stripe_account_id IS NOT NULL
    AND NEW.country IS DISTINCT FROM OLD.country
    AND NEW.stripe_account_id IS NOT DISTINCT FROM OLD.stripe_account_id
  THEN
    RAISE EXCEPTION 'country_locked'
      USING
        ERRCODE = 'P0001',
        DETAIL = 'Country cannot be changed once Stripe Connect account exists';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_lock_country_after_stripe_connect ON public.profiles;

CREATE TRIGGER profiles_lock_country_after_stripe_connect
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_country_change_after_stripe_connect();

CREATE TABLE IF NOT EXISTS public.vendor_country_change_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_country TEXT,
  to_country TEXT NOT NULL,
  old_stripe_account_id TEXT,
  new_stripe_account_id TEXT,
  status TEXT NOT NULL CHECK (
    status IN (
      'check_blocked_balance',
      'check_passed',
      'start_created',
      'start_failed',
      'onboarding_returned',
      'switched',
      'switch_failed'
    )
  ),
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'vendor_country_change_events_country_format_check'
      AND conrelid = 'public.vendor_country_change_events'::regclass
  ) THEN
    ALTER TABLE public.vendor_country_change_events
      ADD CONSTRAINT vendor_country_change_events_country_format_check
      CHECK (
        (from_country IS NULL OR from_country ~ '^[A-Z]{2}$')
        AND to_country ~ '^[A-Z]{2}$'
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_vendor_country_change_events_user_id_created_at
  ON public.vendor_country_change_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_country_change_events_user_id_status
  ON public.vendor_country_change_events(user_id, status);

ALTER TABLE public.vendor_country_change_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert own vendor country change events" ON public.vendor_country_change_events;
DROP POLICY IF EXISTS "Users can view own vendor country change events" ON public.vendor_country_change_events;
DROP POLICY IF EXISTS "Users can update own vendor country change events" ON public.vendor_country_change_events;

CREATE POLICY "Users can insert own vendor country change events"
  ON public.vendor_country_change_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own vendor country change events"
  ON public.vendor_country_change_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

CREATE POLICY "Users can update own vendor country change events"
  ON public.vendor_country_change_events FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP TRIGGER IF EXISTS vendor_country_change_events_updated_at ON public.vendor_country_change_events;

CREATE TRIGGER vendor_country_change_events_updated_at
  BEFORE UPDATE ON public.vendor_country_change_events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
