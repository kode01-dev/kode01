import { logAuditEvent } from '@/lib/security/audit';
import { createAdminClient } from '@/lib/supabase/admin';

const RETENTION_DAYS = 90;

export async function runPurgeMarketingEventsTask(runId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('purge_old_marketing_events', {
    days_to_retain: RETENTION_DAYS,
  });

  if (error) {
    throw new Error(`Failed to purge marketing events: ${error.message}`);
  }

  await logAuditEvent({
    eventType: 'marketing_events_purged',
    metadata: {
      run_id: runId,
      retention_days: RETENTION_DAYS,
      purged: data ?? 0,
    },
  });

  return {
    retentionDays: RETENTION_DAYS,
    purged: data ?? 0,
  };
}
