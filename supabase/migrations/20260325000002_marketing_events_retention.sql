-- ============================================
-- MARKETING ANALYTICS RETENTION POLICY
-- ============================================

-- Configuration table for retention policy
CREATE TABLE marketing_analytics_retention_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  days_to_retain INTEGER NOT NULL DEFAULT 90,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_purge_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default policy
INSERT INTO marketing_analytics_retention_policy (days_to_retain, enabled)
VALUES (90, true);

-- ============================================
-- RETENTION & PURGE FUNCTIONS
-- ============================================

-- Function to purge old marketing events
CREATE OR REPLACE FUNCTION purge_old_marketing_events(days_to_retain INT DEFAULT 90)
RETURNS TABLE(
  events_deleted BIGINT,
  oldest_remaining_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cutoff_date TIMESTAMPTZ;
  v_deleted_count BIGINT;
  v_oldest_date TIMESTAMPTZ;
BEGIN
  -- Calculate cutoff date
  v_cutoff_date := now() - (days_to_retain || ' days')::INTERVAL;

  -- Delete old events
  DELETE FROM marketing_campaign_events
  WHERE created_at < v_cutoff_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Get oldest remaining date
  SELECT MIN(created_at) INTO v_oldest_date
  FROM marketing_campaign_events;

  -- Update policy last_purge_at
  UPDATE marketing_analytics_retention_policy
  SET last_purge_at = now()
  WHERE enabled = true;

  RETURN QUERY SELECT v_deleted_count, v_oldest_date;
END;
$$;

-- Function to get retention policy status
CREATE OR REPLACE FUNCTION get_marketing_retention_status()
RETURNS TABLE(
  days_to_retain INTEGER,
  enabled BOOLEAN,
  last_purge_at TIMESTAMPTZ,
  total_events BIGINT,
  oldest_event_date TIMESTAMPTZ,
  newest_event_date TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.days_to_retain,
    p.enabled,
    p.last_purge_at,
    COUNT(*)::BIGINT as total_events,
    MIN(e.created_at) as oldest_event_date,
    MAX(e.created_at) as newest_event_date
  FROM marketing_analytics_retention_policy p
  LEFT JOIN marketing_campaign_events e ON true
  WHERE p.id = (SELECT id FROM marketing_analytics_retention_policy LIMIT 1)
  GROUP BY p.id, p.days_to_retain, p.enabled, p.last_purge_at;
END;
$$;

-- ============================================
-- SCHEDULED PURGE (Optional: via pg_cron)
-- Note: If pg_cron is available in your Supabase instance
-- ============================================

-- Uncomment below if pg_cron extension is available
-- SELECT cron.schedule('purge-old-marketing-events', '0 2 * * *', 'SELECT purge_old_marketing_events(90)');

-- ============================================
-- GRANTS
-- ============================================

GRANT SELECT ON marketing_analytics_retention_policy TO authenticated, anon;

-- Only admin can call purge function
-- Handled via RLS in application layer

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Check retention policy status
SELECT * FROM get_marketing_retention_status();

-- Check marketing_campaign_events table size
SELECT
  COUNT(*) as total_events,
  MIN(created_at) as oldest_event,
  MAX(created_at) as newest_event,
  COUNT(*) FILTER (WHERE created_at < now() - interval '90 days') as events_to_purge_90days,
  COUNT(*) FILTER (WHERE created_at < now() - interval '180 days') as events_to_purge_180days
FROM marketing_campaign_events;
