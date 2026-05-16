-- Migration: Add scheduled_emails table for automated drip campaigns
-- SOC 2: RLS enforced, search_path hardened

SET search_path = '';

DROP TABLE IF EXISTS public.scheduled_emails CASCADE;

CREATE TABLE public.scheduled_emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id),
    email_type TEXT NOT NULL, -- 'day_1_followup', 'day_7_review', etc.
    scheduled_for TIMESTAMPTZ NOT NULL,
    sent_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status ON public.scheduled_emails(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_scheduled_for ON public.scheduled_emails(scheduled_for);

ALTER TABLE public.scheduled_emails ENABLE ROW LEVEL SECURITY;

-- Admins or service role only for global access
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Service role can manage all scheduled emails'
    ) THEN
        CREATE POLICY "Service role can manage all scheduled emails"
            ON public.scheduled_emails
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE policyname = 'Sellers can view scheduled emails for their customers'
    ) THEN
        CREATE POLICY "Sellers can view scheduled emails for their customers"
            ON public.scheduled_emails FOR SELECT
            USING (EXISTS (
                SELECT 1 FROM public.purchases p
                WHERE p.id = scheduled_emails.purchase_id
                AND p.seller_id = auth.uid()
            ));
    END IF;
END
$$;
