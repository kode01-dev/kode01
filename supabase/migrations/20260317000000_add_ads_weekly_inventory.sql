-- Migration: Weekly block inventory reservations for sponsored news placements
SET search_path = '';

ALTER TABLE public.ad_campaigns
  ADD COLUMN IF NOT EXISTS news_format TEXT CHECK (news_format IN ('split', 'full')),
  ADD COLUMN IF NOT EXISTS rotation_policy_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS inventory_block_start DATE,
  ADD COLUMN IF NOT EXISTS inventory_block_count INTEGER CHECK (inventory_block_count IS NULL OR inventory_block_count > 0);

CREATE TABLE IF NOT EXISTS public.ad_inventory_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.ad_campaigns(id) ON DELETE CASCADE,
  placement_slug TEXT NOT NULL CHECK (placement_slug IN ('news')),
  slot_kind TEXT NOT NULL CHECK (slot_kind IN ('full', 'split')),
  slot_number SMALLINT NOT NULL,
  block_start_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('hold', 'confirmed')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (slot_kind = 'full' AND slot_number = 0)
    OR (slot_kind = 'split' AND slot_number BETWEEN 1 AND 4)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_inventory_unique_campaign_block
  ON public.ad_inventory_reservations(campaign_id, placement_slug, block_start_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_inventory_unique_slot
  ON public.ad_inventory_reservations(placement_slug, block_start_date, slot_kind, slot_number);

CREATE INDEX IF NOT EXISTS idx_ad_inventory_status_expires
  ON public.ad_inventory_reservations(status, expires_at);

ALTER TABLE public.ad_inventory_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ad inventory owner read" ON public.ad_inventory_reservations;
CREATE POLICY "Ad inventory owner read"
  ON public.ad_inventory_reservations FOR SELECT
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1
      FROM public.ad_campaigns c
      WHERE c.id = campaign_id
        AND c.owner_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Ad inventory admin write" ON public.ad_inventory_reservations;
CREATE POLICY "Ad inventory admin write"
  ON public.ad_inventory_reservations FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

CREATE TRIGGER ad_inventory_reservations_updated_at
  BEFORE UPDATE ON public.ad_inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.cleanup_expired_ad_inventory_holds()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  deleted_count INTEGER := 0;
BEGIN
  DELETE FROM public.ad_inventory_reservations
  WHERE placement_slug = 'news'
    AND status = 'hold'
    AND expires_at IS NOT NULL
    AND expires_at < now();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_news_inventory(
  p_campaign_id UUID,
  p_news_format TEXT,
  p_block_count INTEGER,
  p_timezone TEXT DEFAULT 'America/Toronto',
  p_hold_expires_at TIMESTAMPTZ DEFAULT (now() + interval '30 minutes')
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  desired_slot_kind TEXT;
  today_local DATE;
  start_block DATE;
  block_date DATE;
  slot_number SMALLINT;
  existing_kind TEXT;
  existing_status TEXT;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_CAMPAIGN', 'message', 'Campaign ID is required.');
  END IF;

  IF p_news_format NOT IN ('split', 'full') THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_FORMAT', 'message', 'News format must be split or full.');
  END IF;

  IF p_block_count IS NULL OR p_block_count <= 0 OR p_block_count > 52 THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_BLOCK_COUNT', 'message', 'Block count must be between 1 and 52.');
  END IF;

  desired_slot_kind := p_news_format;

  PERFORM pg_advisory_xact_lock(hashtext('ad_news_inventory_lock'));
  PERFORM public.cleanup_expired_ad_inventory_holds();

  today_local := timezone(p_timezone, now())::date;
  start_block := (today_local - (extract(isodow FROM today_local)::INT - 1) + 7);

  FOR i IN 0..(p_block_count - 1) LOOP
    block_date := (start_block + (i * 7));

    SELECT r.slot_kind, r.status
    INTO existing_kind, existing_status
    FROM public.ad_inventory_reservations r
    WHERE r.campaign_id = p_campaign_id
      AND r.placement_slug = 'news'
      AND r.block_start_date = block_date
    LIMIT 1;

    IF FOUND THEN
      IF existing_kind <> desired_slot_kind THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error_code', 'FORMAT_MISMATCH',
          'message', format('Campaign already reserved block %s with slot kind %s.', block_date::TEXT, existing_kind)
        );
      END IF;

      IF existing_status = 'hold' THEN
        UPDATE public.ad_inventory_reservations
        SET expires_at = p_hold_expires_at
        WHERE campaign_id = p_campaign_id
          AND placement_slug = 'news'
          AND block_start_date = block_date
          AND status = 'hold';
      END IF;

      CONTINUE;
    END IF;

    IF desired_slot_kind = 'full' THEN
      IF EXISTS (
        SELECT 1
        FROM public.ad_inventory_reservations r
        WHERE r.placement_slug = 'news'
          AND r.block_start_date = block_date
          AND r.slot_kind = 'full'
      ) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error_code', 'SLOT_FULL',
          'message', format('Full slot is not available for block %s.', block_date::TEXT)
        );
      END IF;

      slot_number := 0;
    ELSE
      SELECT gs.slot_number::SMALLINT
      INTO slot_number
      FROM generate_series(1, 4) AS gs(slot_number)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.ad_inventory_reservations r
        WHERE r.placement_slug = 'news'
          AND r.block_start_date = block_date
          AND r.slot_kind = 'split'
          AND r.slot_number = gs.slot_number
      )
      ORDER BY gs.slot_number
      LIMIT 1;

      IF slot_number IS NULL THEN
        RETURN jsonb_build_object(
          'ok', false,
          'error_code', 'SLOT_FULL',
          'message', format('Split slots are full for block %s.', block_date::TEXT)
        );
      END IF;
    END IF;

    INSERT INTO public.ad_inventory_reservations (
      campaign_id,
      placement_slug,
      slot_kind,
      slot_number,
      block_start_date,
      status,
      expires_at
    )
    VALUES (
      p_campaign_id,
      'news',
      desired_slot_kind,
      slot_number,
      block_date,
      'hold',
      p_hold_expires_at
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'block_start', start_block,
    'block_count', p_block_count,
    'slot_kind', desired_slot_kind
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_news_inventory(
  p_campaign_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  confirmed_count INTEGER := 0;
BEGIN
  IF p_campaign_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_CAMPAIGN', 'message', 'Campaign ID is required.');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('ad_news_inventory_lock'));
  PERFORM public.cleanup_expired_ad_inventory_holds();

  UPDATE public.ad_inventory_reservations
  SET status = 'confirmed',
      expires_at = NULL
  WHERE campaign_id = p_campaign_id
    AND placement_slug = 'news'
    AND status = 'hold'
    AND (expires_at IS NULL OR expires_at > now());

  SELECT count(*)::INT
  INTO confirmed_count
  FROM public.ad_inventory_reservations
  WHERE campaign_id = p_campaign_id
    AND placement_slug = 'news'
    AND status = 'confirmed';

  RETURN jsonb_build_object('ok', true, 'confirmed_count', confirmed_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_news_inventory_window(
  p_campaign_id UUID,
  p_timezone TEXT DEFAULT 'America/Toronto'
)
RETURNS TABLE(
  block_start DATE,
  block_count INTEGER,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  min_block DATE;
  total_blocks INTEGER;
BEGIN
  SELECT MIN(r.block_start_date), COUNT(*)::INT
  INTO min_block, total_blocks
  FROM public.ad_inventory_reservations r
  WHERE r.campaign_id = p_campaign_id
    AND r.placement_slug = 'news'
    AND r.status = 'confirmed';

  IF min_block IS NULL OR total_blocks IS NULL OR total_blocks = 0 THEN
    RETURN;
  END IF;

  block_start := min_block;
  block_count := total_blocks;
  start_at := (min_block::timestamp AT TIME ZONE p_timezone);
  end_at := ((min_block + (total_blocks * 7))::timestamp AT TIME ZONE p_timezone);

  RETURN NEXT;
END;
$$;
