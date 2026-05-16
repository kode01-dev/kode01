-- 1) VUES: corriger le mode de sécurité (priorité haute)
ALTER VIEW public.active_billing_entitlements SET (security_invoker = true);
ALTER VIEW public.seller_revenue_summary SET (security_invoker = true);

-- 2) VUES: fermer les accès larges, puis réouvrir seulement ce qui est voulu
REVOKE ALL ON public.active_billing_entitlements FROM anon, authenticated;
REVOKE ALL ON public.seller_revenue_summary FROM anon, authenticated;

-- Optionnel: si tu veux lecture utilisateur connecté sur active_billing_entitlements
-- (avec security_invoker + RLS table source, l'utilisateur ne verra que ses lignes)
GRANT SELECT ON public.active_billing_entitlements TO authenticated;

-- Optionnel: seller_revenue_summary
-- Recommande de NE PAS exposer à anon/authenticated directement.
-- Soit pas de grant public, soit accès via RPC/API serveur contrôlée.

-- 3) TABLE RETENTION: activer RLS
ALTER TABLE public.marketing_analytics_retention_policy ENABLE ROW LEVEL SECURITY;

-- 4) Retirer accès public actuel
REVOKE ALL ON public.marketing_analytics_retention_policy FROM anon, authenticated;

-- 5) Politique minimale (admin seulement)
DROP POLICY IF EXISTS "Admins can read retention policy" ON public.marketing_analytics_retention_policy;
CREATE POLICY "Admins can read retention policy"
ON public.marketing_analytics_retention_policy
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid()
      AND pr.role = 'admin'
  )
);
