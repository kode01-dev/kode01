-- Migration: purchase incidents workflow for order safety/support
-- Adds buyer/admin incident tracking + action logs + notification templates.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.purchase_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  issue_type TEXT NOT NULL CHECK (
    issue_type IN ('purchase_info_missing', 'content_missing', 'license_issue', 'other')
  ),
  status TEXT NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'in_progress', 'resolved', 'rejected')
  ),
  decision TEXT CHECK (decision IN ('confirmed', 'not_confirmed')),
  opened_by TEXT NOT NULL CHECK (opened_by IN ('buyer', 'admin')),
  assigned_admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_incidents_status
  ON public.purchase_incidents(status);
CREATE INDEX IF NOT EXISTS idx_purchase_incidents_issue_type
  ON public.purchase_incidents(issue_type);
CREATE INDEX IF NOT EXISTS idx_purchase_incidents_decision
  ON public.purchase_incidents(decision);
CREATE INDEX IF NOT EXISTS idx_purchase_incidents_created_at
  ON public.purchase_incidents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_incidents_buyer_id
  ON public.purchase_incidents(buyer_id);
CREATE INDEX IF NOT EXISTS idx_purchase_incidents_purchase_id
  ON public.purchase_incidents(purchase_id);

DROP TRIGGER IF EXISTS purchase_incidents_updated_at ON public.purchase_incidents;
CREATE TRIGGER purchase_incidents_updated_at
  BEFORE UPDATE ON public.purchase_incidents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.purchase_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can read own purchase incidents" ON public.purchase_incidents;
CREATE POLICY "Buyers can read own purchase incidents"
  ON public.purchase_incidents FOR SELECT
  USING (buyer_id = auth.uid());

DROP POLICY IF EXISTS "Admins can read all purchase incidents" ON public.purchase_incidents;
CREATE POLICY "Admins can read all purchase incidents"
  ON public.purchase_incidents FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Buyers can create own purchase incidents" ON public.purchase_incidents;
CREATE POLICY "Buyers can create own purchase incidents"
  ON public.purchase_incidents FOR INSERT
  WITH CHECK (
    buyer_id = auth.uid()
    AND opened_by = 'buyer'
  );

DROP POLICY IF EXISTS "Admins can create purchase incidents" ON public.purchase_incidents;
CREATE POLICY "Admins can create purchase incidents"
  ON public.purchase_incidents FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can update purchase incidents" ON public.purchase_incidents;
CREATE POLICY "Admins can update purchase incidents"
  ON public.purchase_incidents FOR UPDATE
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

CREATE TABLE IF NOT EXISTS public.purchase_incident_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.purchase_incidents(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('buyer', 'admin', 'system')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_purchase_incident_actions_incident_created
  ON public.purchase_incident_actions(incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_purchase_incident_actions_action_type
  ON public.purchase_incident_actions(action_type);

ALTER TABLE public.purchase_incident_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buyers can read own purchase incident actions" ON public.purchase_incident_actions;
CREATE POLICY "Buyers can read own purchase incident actions"
  ON public.purchase_incident_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.purchase_incidents pi
      WHERE pi.id = incident_id
        AND pi.buyer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admins can read all purchase incident actions" ON public.purchase_incident_actions;
CREATE POLICY "Admins can read all purchase incident actions"
  ON public.purchase_incident_actions FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can insert purchase incident actions" ON public.purchase_incident_actions;
CREATE POLICY "Admins can insert purchase incident actions"
  ON public.purchase_incident_actions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Buyers can insert own incident_opened action" ON public.purchase_incident_actions;
CREATE POLICY "Buyers can insert own incident_opened action"
  ON public.purchase_incident_actions FOR INSERT
  WITH CHECK (
    actor_user_id = auth.uid()
    AND actor_role = 'buyer'
    AND action_type = 'incident_opened'
    AND EXISTS (
      SELECT 1
      FROM public.purchase_incidents pi
      WHERE pi.id = incident_id
        AND pi.buyer_id = auth.uid()
    )
  );

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
    'order_incident_update',
    'Order incident update',
    'Status update for an order incident.',
    'Update on your order issue',
    'Mise a jour de votre incident de commande',
    'Your order incident has been updated by our team.',
    'Votre incident de commande a ete mis a jour par notre equipe.',
    true,
    true,
    true
  ),
  (
    'order_access_restored',
    'Order access notification',
    'Notifies buyer that order access/purchase information was re-sent.',
    'Your purchase access details were re-sent',
    'Vos informations d acces ont ete renvoyees',
    'We have re-sent your purchase information and access details.',
    'Nous avons renvoye vos informations d achat et d acces.',
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
