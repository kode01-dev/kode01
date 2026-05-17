import { logAuditEvent } from '@/lib/security/audit';
import { createAdminClient } from '@/lib/supabase/admin';

const RETENTION_DAYS = 365;

export async function runPurgeRecommendationEventsTask(runId: string) {
  const cutoffDate = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const admin = createAdminClient();

  const { count, error } = await admin
    .from('recommendation_events')
    .delete({ count: 'exact' })
    .lt('created_at', cutoffDate.toISOString());

  if (error) {
    throw new Error(`Failed to purge recommendation events: ${error.message}`);
  }

  await logAuditEvent({
    eventType: 'recommendation_events_purged',
    metadata: {
      run_id: runId,
      retention_days: RETENTION_DAYS,
      cutoff: cutoffDate.toISOString(),
      purged: count ?? 0,
    },
  });

  return {
    retentionDays: RETENTION_DAYS,
    cutoff: cutoffDate.toISOString(),
    purged: count ?? 0,
  };
}
