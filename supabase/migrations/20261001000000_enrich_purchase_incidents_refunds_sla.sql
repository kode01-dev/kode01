-- Migration: enrich purchase incidents for evidence uploads, SLA, and Stripe refunds.

SET search_path = '';

ALTER TABLE public.purchase_incidents
  ADD COLUMN IF NOT EXISTS evidence_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sla_deadline_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_amount INTEGER,
  ADD COLUMN IF NOT EXISTS resolution TEXT;

UPDATE public.purchase_incidents
SET evidence_urls = '[]'::jsonb
WHERE evidence_urls IS NULL;

ALTER TABLE public.purchase_incidents
  ALTER COLUMN evidence_urls SET DEFAULT '[]'::jsonb,
  ALTER COLUMN evidence_urls SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_incidents_evidence_urls_array_check'
      AND conrelid = 'public.purchase_incidents'::regclass
  ) THEN
    ALTER TABLE public.purchase_incidents
      ADD CONSTRAINT purchase_incidents_evidence_urls_array_check
      CHECK (jsonb_typeof(evidence_urls) = 'array');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_incidents_refund_amount_nonnegative_check'
      AND conrelid = 'public.purchase_incidents'::regclass
  ) THEN
    ALTER TABLE public.purchase_incidents
      ADD CONSTRAINT purchase_incidents_refund_amount_nonnegative_check
      CHECK (refund_amount IS NULL OR refund_amount >= 0);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_incidents_resolution_check'
      AND conrelid = 'public.purchase_incidents'::regclass
  ) THEN
    ALTER TABLE public.purchase_incidents
      ADD CONSTRAINT purchase_incidents_resolution_check
      CHECK (
        resolution IS NULL
        OR resolution IN ('refunded', 'partial_refund', 'rejected', 'escalated')
      );
  END IF;
END
$$;

-- Backfill SLA for already-open incidents with a conservative 3-day deadline.
UPDATE public.purchase_incidents
SET sla_deadline_at = created_at + INTERVAL '3 days'
WHERE sla_deadline_at IS NULL
  AND status IN ('open', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_purchase_incidents_sla_deadline_at
  ON public.purchase_incidents(sla_deadline_at);

CREATE INDEX IF NOT EXISTS idx_purchase_incidents_resolution
  ON public.purchase_incidents(resolution);

CREATE INDEX IF NOT EXISTS idx_purchase_incidents_stripe_refund_id
  ON public.purchase_incidents(stripe_refund_id);

-- Extend action actor_role to include vendor replies.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'purchase_incident_actions_actor_role_check'
      AND conrelid = 'public.purchase_incident_actions'::regclass
  ) THEN
    ALTER TABLE public.purchase_incident_actions
      DROP CONSTRAINT purchase_incident_actions_actor_role_check;
  END IF;
END
$$;

ALTER TABLE public.purchase_incident_actions
  ADD CONSTRAINT purchase_incident_actions_actor_role_check
  CHECK (actor_role IN ('buyer', 'vendor', 'admin', 'system'));
