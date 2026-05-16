-- Growth: decouple abandoned-cart scanning from email delivery.

SET search_path = '';

CREATE TABLE IF NOT EXISTS public.abandoned_cart_email_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_abandoned_cart_email_jobs_cart_id
  ON public.abandoned_cart_email_jobs(cart_id);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_email_jobs_pending
  ON public.abandoned_cart_email_jobs(status, scheduled_for, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_email_jobs_user_id
  ON public.abandoned_cart_email_jobs(user_id);

DROP TRIGGER IF EXISTS abandoned_cart_email_jobs_updated_at ON public.abandoned_cart_email_jobs;
CREATE TRIGGER abandoned_cart_email_jobs_updated_at
  BEFORE UPDATE ON public.abandoned_cart_email_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.abandoned_cart_email_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage abandoned cart email jobs" ON public.abandoned_cart_email_jobs;
CREATE POLICY "Service role can manage abandoned cart email jobs"
  ON public.abandoned_cart_email_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
