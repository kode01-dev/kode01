-- Migration: Web Push notification delivery queue
-- Adds browser push subscriptions and per-device delivery state.

SET search_path = '';

ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.notification_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_push_subscriptions_user_active
  ON public.notification_push_subscriptions(user_id, is_active, updated_at DESC);

ALTER TABLE public.notification_push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push subscriptions" ON public.notification_push_subscriptions;
CREATE POLICY "Users can view own push subscriptions"
  ON public.notification_push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own push subscriptions" ON public.notification_push_subscriptions;
CREATE POLICY "Users can insert own push subscriptions"
  ON public.notification_push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own push subscriptions" ON public.notification_push_subscriptions;
CREATE POLICY "Users can update own push subscriptions"
  ON public.notification_push_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all push subscriptions" ON public.notification_push_subscriptions;
CREATE POLICY "Admins can view all push subscriptions"
  ON public.notification_push_subscriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS notification_push_subscriptions_updated_at ON public.notification_push_subscriptions;
CREATE TRIGGER notification_push_subscriptions_updated_at
  BEFORE UPDATE ON public.notification_push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.notification_push_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.notification_push_subscriptions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_notification_push_deliveries_pending
  ON public.notification_push_deliveries(status, next_attempt_at, created_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notification_push_deliveries_notification
  ON public.notification_push_deliveries(notification_id);

CREATE INDEX IF NOT EXISTS idx_notification_push_deliveries_subscription
  ON public.notification_push_deliveries(subscription_id);

ALTER TABLE public.notification_push_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own push deliveries" ON public.notification_push_deliveries;
CREATE POLICY "Users can view own push deliveries"
  ON public.notification_push_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.notification_push_subscriptions nps
      WHERE nps.id = subscription_id
        AND nps.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can view all push deliveries" ON public.notification_push_deliveries;
CREATE POLICY "Admins can view all push deliveries"
  ON public.notification_push_deliveries
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS notification_push_deliveries_updated_at ON public.notification_push_deliveries;
CREATE TRIGGER notification_push_deliveries_updated_at
  BEFORE UPDATE ON public.notification_push_deliveries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
