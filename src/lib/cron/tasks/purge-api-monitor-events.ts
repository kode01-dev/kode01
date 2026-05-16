import { createAdminClient } from '@/lib/supabase/admin';
import { API_MONITOR_RETENTION_DAYS } from '@/features/api-monitoring/server/constants';

function getCutoffIso(): string {
  return new Date(Date.now() - API_MONITOR_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export async function runPurgeApiMonitorEventsTask() {
  const cutoff = getCutoffIso();
  const admin = createAdminClient();
  const { count, error } = await admin
    .from('external_api_call_events')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (error) {
    throw error;
  }

  return {
    retentionDays: API_MONITOR_RETENTION_DAYS,
    cutoff,
    purged: count ?? 0,
  };
}
