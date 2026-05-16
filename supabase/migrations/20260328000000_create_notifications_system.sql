-- Migration: notifications + notification templates
-- Unified in-app + email notification foundation (Brevo transport from server runtime)

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  link TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  email_to TEXT,
  email_subject TEXT,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_provider TEXT,
  email_provider_message_id TEXT,
  email_error TEXT,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON public.notifications(user_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_created_at
  ON public.notifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_template_key
  ON public.notifications(template_key);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
CREATE POLICY "Users can view own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all notifications" ON public.notifications;
CREATE POLICY "Admins can view all notifications"
  ON public.notifications
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.notification_templates (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  subject_en TEXT NOT NULL,
  subject_fr TEXT NOT NULL,
  message_en TEXT NOT NULL,
  message_fr TEXT NOT NULL,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  in_app_enabled BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_templates_is_active
  ON public.notification_templates(is_active);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read notification templates" ON public.notification_templates;
CREATE POLICY "Admins can read notification templates"
  ON public.notification_templates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert notification templates" ON public.notification_templates;
CREATE POLICY "Admins can insert notification templates"
  ON public.notification_templates
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update notification templates" ON public.notification_templates;
CREATE POLICY "Admins can update notification templates"
  ON public.notification_templates
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete notification templates" ON public.notification_templates;
CREATE POLICY "Admins can delete notification templates"
  ON public.notification_templates
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP TRIGGER IF EXISTS notification_templates_updated_at ON public.notification_templates;
CREATE TRIGGER notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

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
VALUES
  (
    'manual_admin_message',
    'Manual admin message',
    'Manual one-off message sent from admin controllers panel.',
    'New notification from KODE01',
    'Nouvelle notification de KODE01',
    'You have a new update from the KODE01 team.',
    'Vous avez une nouvelle mise a jour de l equipe KODE01.',
    true,
    true,
    true
  ),
  (
    'ads_campaign_approved',
    'Ads campaign approved',
    'Sent when an ads campaign is approved by an admin.',
    'Your ad campaign has been approved',
    'Votre campagne publicitaire a ete approuvee',
    'Your campaign has been approved and is now active.',
    'Votre campagne a ete approuvee et est maintenant active.',
    true,
    true,
    true
  ),
  (
    'ads_campaign_rejected',
    'Ads campaign rejected',
    'Sent when an ads campaign is rejected by an admin.',
    'Your ad campaign has been rejected',
    'Votre campagne publicitaire a ete rejetee',
    'Your campaign needs updates before it can go live.',
    'Votre campagne doit etre ajustee avant publication.',
    true,
    true,
    true
  ),
  (
    'ads_campaign_paused',
    'Ads campaign paused',
    'Sent when an ads campaign is paused by an admin.',
    'Your ad campaign has been paused',
    'Votre campagne publicitaire a ete mise en pause',
    'Your active campaign has been paused.',
    'Votre campagne active a ete mise en pause.',
    true,
    true,
    true
  ),
  (
    'ads_campaign_resumed',
    'Ads campaign resumed',
    'Sent when an ads campaign is resumed by an admin.',
    'Your ad campaign is active again',
    'Votre campagne publicitaire est active de nouveau',
    'Your campaign has been resumed.',
    'Votre campagne a ete reactivee.',
    true,
    true,
    true
  ),
  (
    'ads_campaign_cancelled',
    'Ads campaign cancelled',
    'Sent when an ads campaign is cancelled by an admin.',
    'Your ad campaign has been cancelled',
    'Votre campagne publicitaire a ete annulee',
    'Your campaign has been cancelled by the admin team.',
    'Votre campagne a ete annulee par l equipe admin.',
    true,
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
