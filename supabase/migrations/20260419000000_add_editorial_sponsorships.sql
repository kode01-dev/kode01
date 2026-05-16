-- Migration: add sponsored editorial workflow (paid submissions + admin review).

SET search_path = '';

ALTER TABLE public.editorial_posts
  ADD COLUMN IF NOT EXISTS is_sponsored BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sponsorship_status TEXT NOT NULL DEFAULT 'none'
    CHECK (sponsorship_status IN ('none', 'pending_payment', 'pending_review', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS sponsored_owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sponsored_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sponsored_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sponsored_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sponsored_rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sponsored_rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sponsored_rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_editorial_posts_sponsored_status
  ON public.editorial_posts(is_sponsored, sponsorship_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_posts_sponsored_owner
  ON public.editorial_posts(sponsored_owner_user_id, created_at DESC)
  WHERE is_sponsored = true;

CREATE TABLE IF NOT EXISTS public.editorial_sponsorship_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  translation_group_id UUID NOT NULL,
  owner_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  stripe_checkout_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT UNIQUE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'cad',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_editorial_sponsorship_orders_translation_group
  ON public.editorial_sponsorship_orders(translation_group_id);

CREATE INDEX IF NOT EXISTS idx_editorial_sponsorship_orders_owner
  ON public.editorial_sponsorship_orders(owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_sponsorship_orders_status
  ON public.editorial_sponsorship_orders(status, updated_at DESC);

DROP TRIGGER IF EXISTS editorial_sponsorship_orders_updated_at ON public.editorial_sponsorship_orders;
CREATE TRIGGER editorial_sponsorship_orders_updated_at
  BEFORE UPDATE ON public.editorial_sponsorship_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.editorial_sponsorship_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Editorial sponsorship orders owner/admin read" ON public.editorial_sponsorship_orders;
CREATE POLICY "Editorial sponsorship orders owner/admin read"
  ON public.editorial_sponsorship_orders
  FOR SELECT
  USING (owner_user_id = auth.uid() OR public.is_admin_user());
